import { Adapter, Schema, Context } from 'koishi'
import { RedBot } from './bot'
import { adaptSession, decodeUser } from './utils'
import { MetaConnectResponse } from './types'

export class WsClient<C extends Context = Context> extends Adapter.WsClient<C, RedBot<C>> {
    async prepare() {
        const { protocol, host } = new URL(this.bot.config.endpoint)
        return this.bot.http.ws((protocol === 'https:' ? 'wss://' : 'ws://') + host)
    }

    accept() {
        this.socket.addEventListener('message', async ({ data }) => {
            const parsed = JSON.parse(data.toString())
            if (parsed.type === 'meta::connect') {
                const payload: MetaConnectResponse = parsed.payload
                const selfId = this.bot.selfId
                const currAccount = payload.authData.uin
                if (selfId !== currAccount) {
                    return this.socket.close(1008, `configured selfId is ${selfId}, but the currently connected account is ${currAccount}`)
                }
                this.bot.user = decodeUser(await this.bot.internal.getMe())
                return this.bot.online()
            } else if (parsed.type === 'message::poke') {
                this.bot.dispatch(this.bot.session({
                    type: 'internal',
                    _type: 'red/unsafe-notify',
                    _data: parsed.payload[0],
                }))
            }

            this.bot.dispatch(this.bot.session({
                type: 'internal',
                _type: 'red/unsafe-message',
                _data: parsed.payload[0],
            }))
            const session = await adaptSession(this.bot, parsed)
            if (session) this.bot.dispatch(session)
        })

        this.socket.send(JSON.stringify({
            type: 'meta::connect',
            payload: {
                token: this.bot.config.token
            }
        }))
    }
}

export namespace WsClient {
    export interface Config extends Adapter.WsClientConfig {
    }

    export const Config: Schema<Config> = Schema.intersect([
        Adapter.WsClientConfig,
    ])
}
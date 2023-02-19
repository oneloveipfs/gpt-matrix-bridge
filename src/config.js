import yargs from 'yargs'
import * as dotenv from 'dotenv'

dotenv.config()
const { argv } = yargs(process.argv)

let config = {
    // logging
    log_level: 'info',

    // mongodb
    mongo_url: 'mongodb://localhost:27017',
    mongo_dbname: 'bridger',

    // matrix
    matrix_homeserver: '',
    matrix_access_token: '',
    matrix_autojoin: false,

    // discord
    discord_guild_id: '',
    discord_bot_token: '',
    discord_webhook_id: '',
    discord_webhook_token: '',
    discord_gpt_bot_id: '',
    discord_reply_embed_chars: 300
}

// Config overwrites through CLI args or environment vars
for (let c in config)
    config[c] = argv[c] || process.env['GPTMXBRIDGE_' + c.toUpperCase()] || config[c]

export default config
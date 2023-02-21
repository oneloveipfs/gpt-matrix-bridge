import yargs from 'yargs'
import * as dotenv from 'dotenv'

dotenv.config()
const { argv } = yargs(process.argv)

let config = {
    // logging
    log_level: 'debug',

    // mongodb
    mongo_url: 'mongodb://localhost:27017',
    mongo_dbname: 'bridger',

    // credits system
    credits_initial: 3,
    credits_refill_price_usd: 0.25,
    credits_cost_per_msg: 1,
    credits_memo_prefix: 'gpt-matrix-refill:',
    credits_hive_receiver: '',
    credits_hive_api: 'https://techcoderx.com',

    // matrix
    matrix_homeserver: '',
    matrix_access_token: '',
    matrix_autojoin: false,
    matrix_bot_room: '',

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
    if (typeof config[c] === 'number')
        config[c] = parseFloat(argv[c]) || parseFloat(process.env['GPTMXBRIDGE_' + c.toUpperCase()]) || config[c]
    else
        config[c] = argv[c] || process.env['GPTMXBRIDGE_' + c.toUpperCase()] || config[c]

export default config
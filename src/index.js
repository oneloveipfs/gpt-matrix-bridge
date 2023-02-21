import logger from './logger.js'
import config from './config.js'
import mapping from './mapping.js'
import db from './db.js'
import streamer from './streamer.js'
import shawp from './shawp.js'
import { MatrixClient, SimpleFsStorageProvider, AutojoinRoomsMixin } from 'matrix-bot-sdk'
import { Client, GatewayIntentBits, WebhookClient, EmbedBuilder, MessageType } from 'discord.js'

mapping.init()

/** Matrix Bot */
const storage = new SimpleFsStorageProvider('bot.json')
const matrixClient = new MatrixClient(config.matrix_homeserver,config.matrix_access_token,storage)

if (config.matrix_autojoin)
    AutojoinRoomsMixin.setupOnClient(matrixClient)

matrixClient.on('room.message', handleMatrixMsg)
await matrixClient.start()
logger.info('Matrix Bot started!')

async function handleMatrixMsg(roomId, event) {
    if (!event || !event.content) return
    if (event.sender === await matrixClient.getUserId()) return
    if (event.unsigned && event.unsigned.age > 60000) return
    logger.trace(roomId,event)

    let replyTo = ''
    if (event.content['m.relates_to'] && event.content['m.relates_to']['m.in_reply_to'] && event.content['m.relates_to']['m.in_reply_to'].event_id) {
        let reply = await db.collection('messages').findOne({ matrix: event.content['m.relates_to']['m.in_reply_to'].event_id })
        if (reply)
            replyTo = reply
        else
            replyTo = 1
    }
    if (event.content.body.startsWith('!') && (roomId === config.matrix_bot_room || mapping.matrixToDiscord[roomId]))
        return matrixHandleCommand(roomId,event)
    if (mapping.matrixToDiscord[roomId]) {
        const profile = await matrixClient.getUserProfile(event.sender)
        if (event.content.msgtype === 'm.text')
            sendDiscordWebhook(event.sender,httpAvatarUrl(profile.avatar_url),mapping.matrixToDiscord[roomId],event.content.body,event,replyTo)
        else if (event.content.msgtype === 'm.image')
            sendDiscordWebhook(event.sender,httpAvatarUrl(profile.avatar_url),mapping.matrixToDiscord[roomId],httpImageUrl(event.content.url),event,replyTo,true)
    }
}

function httpAvatarUrl(avatarUrl = '') {
    const parts = avatarUrl.split('/')
    const server_id = parts[parts.length-2]
    const avatar_id = parts[parts.length-1]
    return config.matrix_homeserver+'/_matrix/media/r0/thumbnail/'+server_id+'/'+avatar_id+'?width=64&height=64'
}

function httpImageUrl(imageUrl = '') {
    const parts = imageUrl.split('/')
    const server_id = parts[parts.length-2]
    const image_id = parts[parts.length-1]
    return config.matrix_homeserver+'/_matrix/media/r0/download/'+server_id+'/'+image_id
}

function capitalizeFirstLetter(str) {
    return str.charAt(0).toUpperCase() + str.slice(1)
}

async function matrixHandleCommand(roomId, event) {
    let command = event.content.body.trim()
    if (command.startsWith('!ping')) {
        await matrixClient.replyHtmlNotice(roomId,event,'🏓 Pong!')
    } else if (command.startsWith('!headblock')) {
        let result = ''
        for (let i in streamer) {
            if (result.length > 0)
                result += '\n'
            if (i !== '_id' && streamer[i] > 0)
                result += capitalizeFirstLetter(i)+': '+streamer[i]
        }
        if (result.length === 0)
            result = 'There are currently no enabled networks.'
        await matrixClient.replyNotice(roomId,event,result)
    } else if (command.startsWith('!refill')) {
        let result = ''
        for (let i in streamer) {
            if (result.length > 0)
                result += '\n'
            if (i !== '_id' && streamer[i] > 0) {
                if (result.length === 0)
                    result += `<h4>Refill payment info for ${event.sender}</h4><p>`
                switch (i) {
                    case 'hive':
                        result += `<b>HIVE/HBD</b> - ${config.credits_hive_receiver} (Memo: <code>${config.credits_memo_prefix}${event.sender}</code>)`
                        break
                    default:
                        break
                }
            }
        }
        if (result.length > 0)
            result += '</p>'
        else
            result = 'There are currently no payment methods enabled.'
        await matrixClient.replyHtmlNotice(roomId,event,result)
    } else if (command.startsWith('!balance')) {
        await matrixClient.replyNotice(roomId,event,`Your current balance is ${await shawp.getCredits(event.sender)} credits. Sending each message to Dave costs ${config.credits_cost_per_msg} credits.`)
    } else if (command.startsWith('!help')) {
        await matrixClient.replyHtmlNotice(roomId,event,
            `
            <h4>GPT Bridge Help</h4><p>
            <b>!balance</b> - Returns the credit balance for user<br>
            <b>!headblock</b> - Returns currently processed block by the payment system<br>
            <b>!help</b> - Displays this help message<br>
            <b>!ping</b> - Asks Dave to make the Pong sound<br>
            <b>!refill</b> - Retrieve credit refill payment info<br>
            </p>
            `
        )
    }
}

/** Discord Bot */
const discordClient = new Client({ intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
]})
const discordWebhook = new WebhookClient({ id: config.discord_webhook_id, token: config.discord_webhook_token })

await discordClient.login(config.discord_bot_token)
logger.info(`Logged into Discord as ${discordClient.user.tag}`)

discordClient.on('messageCreate', async (discordMsg) => {
    if (discordMsg.webhookId) return // ignore webhooks sent by this bot
    if (discordMsg.author.id === discordClient.user.id) return // ignore this bot itself
    if (mapping.discordToMatrix[discordMsg.channel.id]) {
        let replyTo = null
        if (discordMsg.type === MessageType.Reply) {
            let reply = await db.collection('messages').findOne({ discord: discordMsg.reference.messageId })
            if (reply)
                replyTo = reply
        }
        if (await db.collection('messages').findOne({ discord: discordMsg.id, discordThread: discordMsg.channelId }))
            return logger.debug('skipping',discordMsg.id)
        if (discordMsg.type === MessageType.Default || discordMsg.type === MessageType.Reply)
            sendMatrixMsg(discordMsg, replyTo)
        else if (discordMsg.type === MessageType.ChannelNameChange)
            updateRoomDescription(mapping.discordToMatrix[discordMsg.channel.id],discordMsg.content)
        discordMsg.attachments.forEach((attachment) => {
            logger.debug(attachment)
        })
    }
})

async function sendMatrixMsg(discordMsg, replyTo) {
    let message = discordMsg.content
    if (discordMsg.author.id !== config.discord_gpt_bot_id)
        message = discordMsg.author.username+'#'+discordMsg.author.discriminator+': '+discordMsg.content
    // for some reason sendText() shows red text, so sending notice instead
    // discordMsg.attachments.forEach((attachment) => message += '\n'+attachment.url)
    let sentMsg = null
    if (replyTo) {
        const replyEvent = await matrixClient.getEvent(mapping.discordToMatrix[discordMsg.channel.id],replyTo.matrix)
        sentMsg = await matrixClient.replyNotice(mapping.discordToMatrix[discordMsg.channel.id],replyEvent,message)
    } else
        sentMsg = await matrixClient.sendNotice(mapping.discordToMatrix[discordMsg.channel.id],message)
    logger.trace(mapping.discordToMatrix[discordMsg.channel.id],replyTo,message)
    logger.debug('Discord: '+discordMsg.id, 'Matrix: '+sentMsg)
    db.collection('messages').insertOne({
        matrix: sentMsg,
        matrixRoom: mapping.discordToMatrix[discordMsg.channel.id],
        discord: discordMsg.id,
        discordThread: discordMsg.channel.id
    })
    discordMsg.attachments.forEach(async (attachment) => {
        let url = await matrixClient.uploadContentFromUrl(attachment.url)
        let s = attachment.url.split('/')
        let fname = s[s.length-1]
        await matrixClient.sendMessage(mapping.discordToMatrix[discordMsg.channel.id],{
            msgtype: 'm.image',
            url: url,
            body: fname
        })
    })
}

async function updateRoomDescription(roomId, newDescription) {
    await matrixClient.sendStateEvent(roomId,'m.room.topic','',{ topic: newDescription })
}

async function sendDiscordWebhook(sender, avatarUrl, threadId, message, event, replyTo = null, noMention = false) {
    const eventId = event.event_id
    if (await db.collection('messages').findOne({ matrix: eventId }))
        return logger.debug('skipping',eventId)
    const embeds = []
    const username = sender.slice(1).split(':')[0]
    const replyThread = await discordClient.channels.fetch(threadId)
    const useWebhook = config.discord_webhook_id && config.discord_webhook_token
    if (typeof replyTo === 'object' && useWebhook) {
        const replyMsg = await replyThread.messages.fetch(replyTo.discord)
        const avatarURL = replyMsg.author.avatarURL()
        let replyContent = replyMsg.content
        if (replyContent.length > 300)
            replyContent = replyContent.substring(0,300)+'...'
        const embed = new EmbedBuilder()
            .setAuthor({ name: replyMsg.author.username, iconURL: avatarURL })
            .setColor('#6adade')
            .setDescription(replyContent)
        embeds.push(embed)
    }
    if (replyTo) {
        let replied = message.split('\n\n')
        replied.shift()
        message = replied.join('\n\n')
    }
    // let noPing = false
    // if (noMention || message.startsWith('~') || message.startsWith('!') || !config.discord_gpt_bot_id || (useWebhook && typeof replyTo === 'object'))
    //     noPing = true
    // if (!noPing)
    //     message = '<@'+config.discord_gpt_bot_id+'> '+message
    if (!message.startsWith('~')) {
        let balanceBefore = await shawp.getCredits(sender)
        if (balanceBefore-config.credits_cost_per_msg < 0)
            return await matrixClient.replyNotice(mapping.discordToMatrix[threadId],event,`You currently do not have enough credits to send messages to Dave. Current balance: ${balanceBefore}`)
        let balanceAfter = await shawp.consumeCredits(sender)
        let msgRemaining = balanceAfter/config.credits_cost_per_msg
        if (msgRemaining <= 0)
            await matrixClient.replyNotice(mapping.discordToMatrix[threadId],event,`You are running out of credits. Refill credits to continue sending messages to Dave. New balance: ${balanceAfter}`)
        else if (msgRemaining <= 2)
            await matrixClient.replyNotice(mapping.discordToMatrix[threadId],event,`You are running low on credits. New balance: ${balanceAfter}`)
    }
    if (useWebhook) {
        const webhookMsg = await discordWebhook.send({
            username: username,
            avatarURL: avatarUrl,
            threadId: threadId,
            content: message,
            embeds: embeds
        })
        if (eventId) {
            logger.debug('Matrix: '+eventId, 'Discord: '+webhookMsg.id)
            db.collection('messages').insertOne({
                matrix: eventId,
                matrixRoom: mapping.discordToMatrix[threadId],
                discord: webhookMsg.id,
                discordThread: threadId
            })
        }
    } else {
        if (typeof replyTo === 'object') {
            const replied = await replyThread.send({
                reply: {messageReference: replyTo.discord},
                content: message,
                allowedMentions: { repliedUser: true }
            })
            logger.debug('Matrix: '+eventId, 'Discord: '+replied.id)
            db.collection('messages').insertOne({
                matrix: eventId,
                matrixRoom: mapping.discordToMatrix[threadId],
                discord: replied.id,
                discordThread: threadId
            })
        } else {
            const sent = await replyThread.send({ content: message })
            logger.debug('Matrix: '+eventId, 'Discord: '+sent.id)
            db.collection('messages').insertOne({
                matrix: eventId,
                matrixRoom: mapping.discordToMatrix[threadId],
                discord: sent.id,
                discordThread: threadId
            })
        }
    }
}

process.on('uncaughtException',(error) => logger.error(error))
process.on('unhandledRejection',(reason) => logger.error(reason))
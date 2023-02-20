import logger from './logger.js'
import config from './config.js'
import mapping from './mapping.js'
import db from './db.js'
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
    if (mapping.matrixToDiscord[roomId]) {
        const profile = await matrixClient.getUserProfile(event.sender)
        if (event.content.msgtype === 'm.text')
            sendDiscordWebhook(event.sender,httpAvatarUrl(profile.avatar_url),mapping.matrixToDiscord[roomId],event.content.body,replyTo,event.event_id)
        else if (event.content.msgtype === 'm.image')
            sendDiscordWebhook(event.sender,httpAvatarUrl(profile.avatar_url),mapping.matrixToDiscord[roomId],httpImageUrl(event.content.url),replyTo,event.event_id,true)
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

async function sendDiscordWebhook(sender, avatarUrl, threadId, message, replyTo = null, eventId = null, noMention = false) {
    if (await db.collection('messages').findOne({ matrix: eventId }))
        return logger.debug('skipping',eventId)
    const embeds = []
    const username = sender.slice(1).split(':')[0]
    const replyThread = await discordClient.channels.fetch(threadId)
    if (typeof replyTo === 'object' && config.discord_webhook_id && config.discord_webhook_token) {
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
    // mention gpt bot by default from webhook
    const useWebhook = config.discord_webhook_id && config.discord_webhook_token
    // let noPing = false
    // if (noMention || message.startsWith('~') || message.startsWith('!') || !config.discord_gpt_bot_id || (useWebhook && typeof replyTo === 'object'))
    //     noPing = true
    // if (!noPing)
    //     message = '<@'+config.discord_gpt_bot_id+'> '+message
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
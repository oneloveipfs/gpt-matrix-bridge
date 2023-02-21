// credit system exclusively for matrix users
import db from './db.js'
import config from './config.js'
import logger from './logger.js'
import axios from 'axios'

const shawp = {
    getCredits: async (username) => {
        let user = await db.collection('users').findOne({ _id: username })
        if (!user || !user.balance)
            return config.credits_initial
        else
            return user.balance
    },
    refillCredits: async (username, usd, numberOfCredits, method, txid) => {
        numberOfCredits = parseFloat(numberOfCredits)
        await db.collection('users').updateOne({ _id: username }, { $inc: { balance: numberOfCredits }},{ upsert: true })
        await db.collection('refills').insertOne({ user: username, usd: usd, credits: numberOfCredits, method: method, txid: txid })
    },
    consumeCredits: async (username) => {
        // called for every message sent that is not ignored by gpt bot
        let user = await db.collection('users').findOne({ _id: username })
        let newBalance = 0
        if (!user || !user.balance) {
            newBalance = config.credits_initial-config.credits_cost_per_msg
            await db.collection('users').insertOne({ _id: username, balance: newBalance })
        } else {
            newBalance = user.balance-config.credits_cost_per_msg
            await db.collection('users').updateOne({ _id: username },{ $inc: { balance: -config.credits_cost_per_msg }})
        }
        return newBalance
    },
    processHiveTx: async (tx, txid) => {
        logger.debug(tx,txid)
        if (typeof tx.amount === 'object')
            tx.amount = shawp.naiToString(tx.amount)
        if (tx.amount.endsWith('HIVE')) {
            let amt = parseFloat(tx.amount.replace(' HIVE',''))
            let usd = await shawp.exchangeRate(0,amt)
            shawp.processRefill(tx,txid,0,usd)
        } else if (tx.amount.endsWith('HBD')) {
            let amt = parseFloat(tx.amount.replace(' HBD',''))
            let usd = await shawp.exchangeRate(1,amt)
            shawp.processRefill(tx,txid,1,usd)
        }
    },
    processRefill: async (tx, txid, method, usd) => {
        let memo = tx.memo.toLowerCase().trim()
        let parsedDetails = shawp.validatePayment(memo)
        if (parsedDetails.length === 0) return
        let refillCreditAmt = (usd/config.credits_refill_price_usd).toFixed(3)
        await shawp.refillCredits(parsedDetails,usd,refillCreditAmt,method,txid)
        logger.debug(`Refilled $${usd} (${refillCreditAmt} credits) to ${parsedDetails} successfully`)
    },
    validatePayment: (memo) => {
        if (!memo.startsWith(config.credits_memo_prefix+'@')) return ''
        return memo.replace(config.credits_memo_prefix,'')
    },
    naiToString: (nai) => {
        let result = (parseInt(nai.amount) / Math.pow(10,nai.precision)).toString() + ' '
        if (nai.nai === '@@000000021')
            result += 'HIVE'
        else if (nai.nai === '@@000000013')
            result += 'HBD'
        return result
    },
    exchangeRate: async (coin,amount) => {
        let coingeckoUrl
        switch (coin) {
            case 0:
                coingeckoUrl = 'https://api.coingecko.com/api/v3/coins/hive?localization=false&tickers=false&market_data=true&community_data=false&developer_data=false&sparkline=false'
                break
            case 1:
                coingeckoUrl = 'https://api.coingecko.com/api/v3/coins/hive_dollar?localization=false&tickers=false&market_data=true&community_data=false&developer_data=false&sparkline=false'
                break
            default:
                return cb({ error: 'invalid coin' })
        }
        let rate = await axios.get(coingeckoUrl)
        return rate.data.market_data.current_price.usd * amount
    },
}

export default shawp
import config from './config.js'
import db from './db.js'
import HiveStreamer from './blockStreamers/hive.js'
import shawp from './shawp.js'

let headBlocks = {
    _id: 0,
    hive: 0
}

const loadedHeadBlocks = await db.collection('headBlocks').findOne({ _id: 0 })
if (loadedHeadBlocks)
    headBlocks = loadedHeadBlocks

if (config.credits_hive_receiver && config.credits_hive_api) {
    const hiveStreamer = new HiveStreamer(config.credits_hive_api,true,'hive',headBlocks.hive)
    hiveStreamer.streamBlocks((newBlock,blockHeight) => {
        newBlock.transactions.forEach(txn => {
            let transaction = txn
            for (let op in transaction.operations)
                if (transaction.operations[op].type === 'transfer_operation' && transaction.operations[op].value.to === config.credits_hive_receiver)
                    shawp.processHiveTx(transaction.operations[op].value,transaction.transaction_id)
        })
        headBlocks.hive = blockHeight
    },async () => await db.collection('headBlocks').updateOne({ _id: 0 },{ $set: {
        hive: headBlocks.hive
    }},{ upsert: true }))
}

export default headBlocks
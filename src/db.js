import config from './config.js'
import logger from './logger.js'
import { MongoClient } from 'mongodb'

const client = await MongoClient.connect(config.mongo_url,{
    useNewUrlParser: true,
    useUnifiedTopology: true
})
logger.info('Connected to '+config.mongo_url+'/'+config.mongo_dbname)
const db = client.db(config.mongo_dbname)
export default db
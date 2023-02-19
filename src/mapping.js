import logger from './logger.js'
import config from './config.js'
import fs from 'fs'

const mapping = {
    matrixToDiscord: {},
    discordToMatrix: {},
    init: () => {
        mapping.matrixToDiscord = JSON.parse(fs.readFileSync('mapping.json','utf-8'))
        for (let i in mapping.matrixToDiscord)
            mapping.discordToMatrix[mapping.matrixToDiscord[i]] = i
        logger.info('Matrix Room <--> Discord Threads mapping loaded')
    }
}

export default mapping
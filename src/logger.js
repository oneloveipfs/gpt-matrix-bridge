import log4js from 'log4js'
import config from './config.js'

log4js.configure({
    levels: {},
    appenders: {
        out: {
            type: 'stdout',
            layout: {
                type: 'pattern',
                pattern: '%[%d [%p] %f{1}:%l%] %x{tab}%m',
                tokens: {
                    tab: (logEvent) => {
                        let filepath = logEvent.fileName.split('/')
                        return ' '.repeat(Math.max(0,18-filepath[filepath.length-1].length+1-logEvent.lineNumber.toString().length-logEvent.level.levelStr.length))
                    }
                }
            }
        },
        file: {
            type: 'file',
            filename: './logs/output.log',
            maxLogSize: 10485760,
            backups: 3,
            compress: true
        }
    },
    categories: { 
        default: { 
            appenders: ['out', 'file'],
            level: config.log_level,
            enableCallStack: true
        }
    }
})

let logger = log4js.getLogger()
logger.info('Logger initialized')
logger.info('NodeJS version: '+process.version)
export default logger
import axios from 'axios'
import logger from '../logger.js'
import config from '../config.js'

export default class {
    constructor(api,irreversible,network = '',startBlock = 0) {
        this.headBlock = startBlock
        this.parsedBlock = startBlock
        this.parsedBlockVops = startBlock
        this.fetchingBlock = false
        this.api = api
        this.irreversible = irreversible ? true : false
        this.network = network
        this.stopped = false
    }

    streamBlocks (cb,completion) {
        // Stream chain props
        this.fetchProps()
        this.propsInterval = setInterval(() => this.fetchProps(),config.credits_hive_dgpo_ms)
    
        // Stream blocks
        this.fetchBlocks(cb,completion)
    }

    fetchProps() {
        axios.post(this.api,{
            id: 1,
            jsonrpc: '2.0',
            method: 'condenser_api.get_dynamic_global_properties',
            params: []
        }).then((props) => {
            if (props.data.result) {
                logger.trace('Fetch '+this.network+' dynamic global props',props.data.result.last_irreversible_block_num)
                let num = this.irreversible ? props.data.result.last_irreversible_block_num : props.data.result.head_block_number
                if (num > this.headBlock && this.headBlock === 0) {
                    this.parsedBlock = num
                    this.parsedBlockVops = num
                }
                this.headBlock = num
            } else {
                // console.error(this.network,'get_dynamic_global_properties error',props.data.error)
            }
        }).catch((e) => {
            // console.error(this.network,'get_dynamic_global_properties error',e.toString())
        })
    }

    fetchBlocks(cb,completion) {
        if (this.stopped) return
        if (this.headBlock === 0 || this.headBlock <= this.parsedBlock) {
            // console.log('skipping round',this.headBlock,this.parsedBlock)
            return setTimeout(() => this.fetchBlocks(cb,completion),3000)
        }
        
        if (this.network === 'hive') {
            let blocksLeft = this.headBlock-this.parsedBlock
            axios.post(this.api,{
                id: 1,
                jsonrpc: '2.0',
                method: 'block_api.get_block_range',
                params: {
                    starting_block_num: this.parsedBlock+1,
                    count: Math.min(blocksLeft,100)
                }
            }).then((newBlocks) => {
                if (newBlocks.data.result && newBlocks.data.result.blocks && newBlocks.data.result.blocks.length > 0) {
                    logger.trace('Fetch block range',this.parsedBlock+1)
                    let gotBlock = this.parsedBlock+1
                    this.parsedBlock += newBlocks.data.result.blocks.length
                    // console.log('parsed',newBlocks.data.result.blocks.length,'headBlock',this.headBlock,'parsedBlock',this.parsedBlock)
                    for (let b in newBlocks.data.result.blocks) {
                        for (let t in newBlocks.data.result.blocks[b].transactions)
                            newBlocks.data.result.blocks[b].transactions[t].transaction_id = newBlocks.data.result.blocks[b].transaction_ids[t]
                        delete newBlocks.data.result.blocks[b].transaction_ids
                        cb(newBlocks.data.result.blocks[b],gotBlock+parseInt(b))
                    }
                    if (typeof completion === 'function')
                        completion()
                    setTimeout(() => this.fetchBlocks(cb,completion),blocksLeft <= 100 ? config.credits_hive_blocks_ms : 3000)
                } else
                    setTimeout(() => this.fetchBlocks(cb,completion),3000)
            }).catch((e) => {
                // console.error(this.network,'get_block_range error',e.toString())
                setTimeout(() => this.fetchBlocks(cb,completion),3000)
            })
        } else {
            axios.post(this.api,{
                id: 1,
                jsonrpc: '2.0',
                method: 'condenser_api.get_block',
                params: [this.parsedBlock+1]
            }).then((newBlock) => {
                if (newBlock.data.result) {
                    this.parsedBlock++
                    // console.log('headBlock',this.headBlock,'parsedBlock',this.parsedBlock)
                    cb(newBlock.data.result)
                    setTimeout(() => this.fetchBlocks(cb,completion),this.headBlock === this.parsedBlock ? 3000 : 250)
                }
            }).catch((e) => {
                // console.error(this.network,'get_block error',e.toString())
                setTimeout(() => this.fetchBlocks(cb,completion),3000)
            })
        }
    }

    fetchVops(filter,cb) {
        if (this.stopped) return
        if (this.network !== 'hive')
            return
        
        if (this.headBlock === 0 || this.headBlock >= this.parsedBlockVops)
            return setTimeout(() => this.fetchVops(filter,cb),3000)

        if (typeof filter !== 'number')
            filter = null

        let end = this.headBlock+1

        axios.post(this.api,{
            id: 1,
            jsonrpc: '2.0',
            method: 'account_history_api.enum_virtual_ops',
            params: {
                block_range_begin: this.parsedBlockVops+1,
                block_range_end: end,
                filter: filter
            }
        }).then((newVops) => {
            if (newVops.data.result && newVops.data.result.ops) {
                this.parsedBlockVops = end-1
                // console.log('parsed vops',newVops.data.result.ops.length,'headBlock',this.headBlock,'parsedBlockVops',this.parsedBlockVops)
                for (let vop in newVops.data.result.ops)
                    cb(newVops.data.result.ops[vop])
            }
            setTimeout(() => this.fetchVops(filter,cb),9000)
        }).catch((e) => {
            // console.error(this.network,'enum_virtual_ops error',e.toString())
            setTimeout(() => this.fetchVops(filter,cb),3000)
        })
    }

    streamTransactions(cb,vopfilter,vopcb) {
        this.streamBlocks((newBlock,height) => {
            let heightForTx = height
            newBlock.transactions.forEach(txn => cb(txn,heightForTx))
        })

        if (this.network === 'hive' && typeof vopcb === 'function')
            this.fetchVops(vopfilter,vopcb)
    }

    stop(cb) {
        this.stopped = true
        clearInterval(this.propsInterval)
        if (typeof cb === 'function')
            setTimeout(cb,10000)
    }
}
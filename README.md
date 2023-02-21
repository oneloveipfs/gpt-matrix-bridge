[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![OneLoveIPFS Discord](https://img.shields.io/discord/956143542391169055.svg?logo=discord)](https://discord.gg/ZWj5NqaBeF)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg?style=flat-square)](http://makeapullrequest.com)

# gpt-matrix-bridge
Make a GPT Discord bot accessible on Matrix.

Compatible with https://github.com/firtoz/GPT-Shell.

## Demo
Demo Of Our Humanoid.Dave GPT On Matrix:
![image](https://user-images.githubusercontent.com/34530588/220094872-a8c1ef17-4e7b-4683-99f3-0d4b5be58360.png)

## Dependencies required

* nodejs and npm (Latest LTS, v16 minimum supported)
* MongoDB
* Matrix account for the bot
* The GPT Discord bot must respond to the bridge bot

## Installation
```
git clone https://github.com/oneloveipfs/gpt-matrix-bridge.git
cd gpt-matrix-bridge
npm i
npm run setup-mapping
```

## Configuration
An example config file has been included in `.env.example` file. Copy this to `.env` file and modify. In addition, the bridge may be configured through environment variables and command line args.

Environment variables are prefixed with `GPTMXBRIDGE_` and uppercased.

|Argument|Description|Default|
|-|-|-|
|`--log_level`|Sets the log level of the bridge|debug|
|`--mongo_url`|MongoDB connection URL|mongodb://localhost:27017|
|`--mongo_dbname`|MongoDB database name|bridger|
|`--credits_initial`|Starting credits for newcomers|3|
|`--credits_refill_price_usd`|USD price for each credit|0.25|
|`--credits_cost_per_msg`|Credits cost to send one message|1|
|`--credits_memo_prefix`|Memo prefix for refilling using certain payment methods|gpt-matrix-refill:|
|`--matrix_homeserver`|Matrix homeserver where bridged room lives in||
|`--matrix_access_token`|Matrix bot user access token||
|`--matrix_bot_room`|Additional Matrix room ID to respond to bot commands to||
|`--discord_guild_id`|Discord guild ID where bridged server lives in||
|`--discord_bot_token`|Discord bot token||
|`--discord_gpt_bot_id`|The actual GPT Discord bot ID||

## Setup mapping
Each Matrix room have to be mapped to a Discord thread manually. Define the mapping in `mapping.json` file.

* Key: Matrix room ID
* Value: Discord channel/thread ID

## Start bridge
```
npm start
```

## Payments
As of now HIVE/HBD payments are accepted. New payment methods may be added in `src/streamer.js` and `src/shawp.js` files. Put blockchain streamers in `src/blockStreamers` folder.

The configuration details for the payment methods are as follows:

|Argument|Description|Default|
|-|-|-|
|`--credits_hive_receiver`|Hive username where payments are sent to||
|`--credits_hive_api`|Hive API node for listening to new transactions|https://techcoderx.com|

It is strongly recommended to point the API nodes to your own node that you control. **Not your node, not your rules.**
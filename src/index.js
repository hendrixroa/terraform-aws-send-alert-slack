const _ = require('lodash');
const Redis = require("ioredis");
const FunctionShield = require('@puresec/function-shield');
const logger = require('pino')();
const { WebClient } = require('@slack/web-api');

const ENV = process.env;
const slackClient = new WebClient(ENV.slack_elastic_alert_token);
const redisConn = new Redis(ENV.redis_url);
const nameChannel = ENV.name_channel;

FunctionShield.configure(
    {
        policy: {
            read_write_tmp: 'alert',
            create_child_process: 'alert',
            outbound_connectivity: 'alert',
            read_handler: 'alert'
        },
        disable_analytics: false,
        token: ENV.function_shield_token
    });

exports.handler = async (event, context) => {
    context.callbackWaitsForEmptyEventLoop = false;

    const dataInput = JSON.parse(JSON.stringify(event.Records[0].Sns));
    const cutMessages = dataInput.Message.split('SM_CUSTOM_DELIMITER');

    // Removes empty message
    cutMessages.pop();

    const messagesParsed = cutMessages.map(item => {
        return JSON.parse(item)
    });

    let dataMessage = JSON.parse(JSON.stringify(messagesParsed));

    // Removes duplicates
    dataMessage = _.uniqWith(dataMessage, _.isEqual);

    if(dataMessage.length === 0) {
        return context.succeed();
    }

    for (let item of dataMessage){

        // Checking duplicates in redis
        const keyMsgId = `es-event:${item.id}`;
        const msgRedisState = await redisConn.setnx(keyMsgId, 1);
        if(!msgRedisState){
            await redisConn.expire(keyMsgId, 60 * 8 ); // Expire by 8min
            // Skip send this alert, it is repeated.
            continue;
        }

        let errorMessage = item.message;
        const colorStage = getStageSlack(item.stage);

        let postData = {
            channel: nameChannel,
            username: 'Elastic Alerts Bot',
            icon_emoji: ':exclamation:',
            attachments: [],
            mrkdwn: true
        };

        try {

            await slackClient.chat.postMessage({
                ...postData,
                attachments: [
                    {
                        author_name: `${item.nameService.toUpperCase()} - ${colorStage.stage.toUpperCase()}`,
                        attachment_type: 'default',
                        color: colorStage.color,
                        text: `*ERROR*: ${errorMessage} (<${item.kibanaUrl}|Kibana>)`,
                        mrkdwn_in: 'text'
                    },
                ],
            });
        } catch (error) {
            logger.error('Error to send alerts: ', error);
            return context.fail(error);
        }
    }
    return context.succeed();
};

function getStageSlack(stage){
    return stage.includes('staging') ? { stage: 'staging', color: '#ffc76d' } :
        stage.includes('production') ? { stage: 'pro', color: '#ff0000' } : null;
}
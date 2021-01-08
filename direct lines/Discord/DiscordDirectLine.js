"use strict";

global.XMLHttpRequest = require('xhr2');
global.WebSocket = require('ws');

const dotenv = require('dotenv');
const path = require('path');
const ENV_FILE = path.join(__dirname, '../.env');
dotenv.config({ path: ENV_FILE });
const Discord = require('discord.js');
const { Activity, DirectLine } = require('botframework-directlinejs');
const mime = require('mime-types');
const axios = require('axios');

const directLine = new DirectLine({
    secret: process.env.DiscordDirectLineSecret
});

const client = new Discord.Client();

const session = {};

client.on('ready', () => {
    console.log(`Logged in on Discord as ${client.user.tag}`)
})

client.on('message', msg => {
    if (msg.author.bot || msg.system)
        return;

    postActivity(msg)
})

/**
 * Post an activity from Discord to Direct Line
 * @param {Discord.Message} event 
 */
const postActivity = async event => {
    let activity;
    let activityId;

    if (event.type === 'conversationUpdate')
        activity = event;
    else {
        activity = {
            from: { id: event.author.id, name: event.author.username },
            type: 'message',
            text: event.content || "Sample Discord Text"
        }
        await discordAttachmentHandler(event, activity);
        console.log('out');
    }

    directLine
        .postActivity(activity)
        .subscribe(
            id => {
                if (id === "retry") {
                    console.error("Cannot send activity", id, activity)
                    return;
                }

                if (session[id]) {
                    const { activity, toDelete } = session[id];
                    event.channel.send(activity.text);

                    if (toDelete) {
                        event.delete({
                            timeout: 100,
                            reason: "Inappropriate language"
                        });
                    }

                    delete session[id];
                }
                else
                    console.error("Cannot find message in session. Check if the bot has sent the message");
            },
            error => console.error("Error posting activity:", error)
        );
}

directLine.activity$
    .filter(activity => activity.type === 'message' && activity.from.id === process.env.AzureBotName)
    .subscribe(
        activity => {
            session[activity.replyToId] = { activity }
        }
    );

directLine.activity$
    .filter(activity => activity.type !== 'message' && activity.type !== 'custom.delete' && activity.from.id === process.env.AzureBotName)
    .subscribe(
        activity => {
            console.log("\n\n UNKNOW ACTIVITY \n\n", activity)
        }
    );

// Handle custom delete activity
directLine.activity$
    .filter(activity => activity.type === 'custom.delete')
    .subscribe(activity => session[activity.replyToId].toDelete = true);

/**
 * Helper function that adds attachments received from Discord to Activity object to be sent to Direct Line. Manipulates the passed in Activity.
 * @param {Discord.Message} message Message received from discord
 * @param {Activity} activity the activity to be posted
 */
const discordAttachmentHandler = async (message, activity) => {
    const discordAttachments = message.attachments;

    if (discordAttachments.size != 0 && !activity.attachments) {
        activity.attachments = [];
        activity.channelData = {
            attachmentSizes: []
        }
    }

    const keys = discordAttachments.keyArray();

    if (!keys)
        return;

    for (let i = 0; i < keys.length; i++) {
        const attachment = discordAttachments.get(keys[i]);

        const contentType = getContentType(discordUrlParser(attachment.proxyURL));

        if (!contentType.includes("image/"))
            continue;

        const imageData = await downloadImage(attachment.proxyURL)
        const imageBuffer = Buffer.from(imageData);
        const imageSize = imageBuffer.byteLength;
        const base64Image = imageBuffer.toString('base64');

        activity.attachments.push({
            name: attachment.name,
            contentType,
            thumbnailUrl: `data:${contentType};base64,${base64Image}`,
        });

        activity.channelData.attachmentSizes.push(imageSize);
    }

    console.log('finished');
}

/**
 * URL parser for Discord-sent attachments. To be used in conjunction with DiscordConnector.getContentType()
 * @param {string} url 
 */
const discordUrlParser = url => {
    var parsedProxy = url.split(/https:\/\/media.discordapp.net\/attachments\/\d{18}\/\d{18}\//);
    var parsedUrl = url.split(/https:\/\/cdn.discordapp.com\/attachments\/\d{18}\/\d{18}\//);
    var filename = parsedProxy.length > parsedUrl.length ? parsedProxy[1] : parsedUrl[1];
    if (!filename) {
        console.warn('[WARN]: filename for attachment from Discord not found.');
        return;
    }
    return filename;
}

/**
 * Helper function that returns attachment's MIME-type via file extension provided by Discord. Defaults to 'application/octet-stream'
 * @param {string} filename 
 */
const getContentType = filename => {
    return mime.lookup(filename) ? mime.lookup(filename) : 'application/octet-stream';
}

const downloadImage = async imageUrl => {
    const response = await axios.get(imageUrl, { responseType: 'arraybuffer' });
    return response.data;
}

client.login(process.env.DiscordBotToken).catch(e => console.error(e))
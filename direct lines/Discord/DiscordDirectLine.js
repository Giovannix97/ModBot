"use strict";

global.XMLHttpRequest = require('xhr2');
global.WebSocket = require('ws');

const dotenv = require('dotenv');
const path = require('path');
const Discord = require('discord.js');
const { Activity, DirectLine } = require('botframework-directlinejs');
const mime = require('mime-types');

const ENV_FILE = path.join(__dirname, '../.env');
dotenv.config({ path: ENV_FILE });

const directLine = new DirectLine({
    secret: process.env.DiscordDirectLineSecret
});

const client = new Discord.Client();

// Session storage object
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

    if (event.type === 'conversationUpdate')
        activity = event;
    else {
        activity = {
            from: { id: event.author.id, name: event.author.username },
            type: 'message'
        }

        if (event.content)
            activity.text = event.content;

        await discordAttachmentHandler(event, activity);
    }

    directLine
        .postActivity(activity)
        .subscribe(
            id => {
                if (id === "retry") {
                    console.error("[ERROR]: Cannot send activity", id, activity.from)
                    return;
                }

                /* 
                    There are no guarantee about who is called first about the this callback or the one after receiving the activity.
                    So, a session check mecchanism is required. 
                */
                if (session[id])
                    onActivityReceived(id, event);
                else
                    session[id] = { event };

            },
            error => console.error("[ERROR]: Error posting activity:", error)
        );
}
/**
 * Discord logic when an activity from bot is received
 * @param {string} activityId Bot's activity identification
 * @param {Discord.Message} event Discord message origanally sent by the user
 */
const onActivityReceived = (activityId, event) => {
    const { activity, toDelete } = session[activityId];
    event.channel.send(`<@${event.author.id}> ${activity.text}`);

    if (toDelete) {
        event.delete({
            timeout: 100,
            reason: "Inappropriate language"
        });
    }

    delete session[activityId];
}

// Handle all activity messages sent by the bot
directLine.activity$
    .filter(activity => activity.type === 'message' && activity.from.id === process.env.AzureBotName)
    .subscribe(
        activity => {
            /* 
                There are no guarantee about who is called first about the this callback or the one after posting activity.
                So, a session check mecchanism is required. 
            */
            if (session[activity.replyToId]) {
                session[activity.replyToId].activity = activity;
                onActivityReceived(activity.replyToId, session[activity.replyToId].event);
            }
            else {
                session[activity.replyToId] = { activity }
            }
        }
    );

// Unhandled activity logic
directLine.activity$
    .filter(activity => activity.type !== 'message' && activity.type !== 'custom.delete' && activity.from.id === process.env.AzureBotName)
    .subscribe(
        activity => {
            console.warn("[WARN]: Unhandled activity", activity)
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

    if (!keys || keys.length === 0)
        return;
    else
        activity.type = 'event';

    for (let i = 0; i < keys.length; i++) {
        const attachment = discordAttachments.get(keys[i]);

        const contentType = getContentType(discordUrlParser(attachment.proxyURL));

        if (!contentType.includes("image/"))
            continue;

        activity.attachments.push({
            name: attachment.name,
            contentType,
            contentUrl: attachment.proxyURL,
        });
    }
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

client.login(process.env.DiscordBotToken).catch(e => console.error("[ERROR]:", e))
"use strict";

global.XMLHttpRequest = require('xhr2');
global.WebSocket = require('ws');

const dotenv = require('dotenv');
const path = require('path');
const ENV_FILE = path.join(__dirname, '../.env');
dotenv.config({ path: ENV_FILE });
const Discord = require('discord.js');
const { DirectLine } = require('botframework-directlinejs');

const directLine = new DirectLine({
    secret: process.env.DiscordDirectLineSecret
});

const client = new Discord.Client();

const session = {};

client.on('ready', () => {
    console.log(`Logged in as ${client.user.tag}`)
})

client.on('message', msg => {

    if(msg.system)
        console.log("\n\nReceived system message:\n\n", msg)

    if(msg.author.bot || msg.system)
        return;

    directLine.postActivity({
        from: {id: msg.author.id, name: msg.author.username},
        type: 'message',
        text: msg.content
    }).subscribe(
        id => {
            if(session[id]) {
                const { activity, toDelete } = session[id];
                msg.channel.send(activity.text);

                if(toDelete) {
                    msg.delete({
                        timeout: 500,
                        reason: "Inappropriate language"
                    });

                    console.log("Trying to delete message...")
                }

                delete session[id];
            }
            else
                console.log("No message in session", session)
        },
        error => console.error("Error posting activity:", error),
    );
})

directLine.activity$
.filter(activity => activity.type === 'message' && activity.from.id === process.env.AzureBotName)
.subscribe(
    activity => {
        session[activity.replyToId] = { activity }
    }
);

// Handle custom delete activity
directLine.activity$
.filter(activity => activity.type === 'custom.delete')
.subscribe(
    activity => {
        console.log("--------\n\nThis is not a message!\n\n--------\n\n", activity)
        session[activity.replyToId].toDelete = true;
    }
)

client.login(process.env.DiscordBotToken).catch(e => console.error(e))
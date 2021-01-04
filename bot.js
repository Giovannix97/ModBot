// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

const { ActivityHandler, MessageFactory } = require('botbuilder');
const { sentimentAnalysis } = require('./moderation');



class ModBot extends ActivityHandler {
    constructor() {
        super();
        // See https://aka.ms/about-bot-activity-message to learn more about the message and other activity types.
        this.onMessage(async (context, next) => {
            const receivedText = context.activity.text ;
            const document = await sentimentAnalysis([receivedText]);
           
            const replyText = `Mi hai scritto: ${receivedText}.\n Al ${document[0].confidenceScores.positive.toFixed(2)} è positivo\n, al ${document[0].confidenceScores.neutral.toFixed(2)} è neutro,\n al ${document[0].confidenceScores.negative.toFixed(2)} è negativo\n`;

            await context.sendActivity(MessageFactory.text(replyText, replyText));
            // By calling next() you ensure that the next BotHandler is run.
            await next();
        });

        this.onMembersAdded(async (context, next) => {
            const membersAdded = context.activity.membersAdded;
            const welcomeText = 'Hello and welcome!';
            for (let cnt = 0; cnt < membersAdded.length; ++cnt) {
                if (membersAdded[cnt].id !== context.activity.recipient.id) {
                    await context.sendActivity(MessageFactory.text(welcomeText, welcomeText));
                }
            }
            // By calling next() you ensure that the next BotHandler is run.
            await next();
        });
    }
}

module.exports.ModBot = ModBot;

// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

const { ActivityHandler, MessageFactory, ActivityTypes } = require('botbuilder');
const { ContentModerator } = require('./services/ContentModerator');
const { UserController } = require('./services/userController');

class ModBot extends ActivityHandler {
    constructor() {
        super();

        // Field for the moderation service
        this.contentModerator = new ContentModerator();
        // Field for the persistence
        this.userController = new UserController();

        // See https://aka.ms/about-bot-activity-message to learn more about the message and other activity types.
        this.onMessage(async (context, next) => {        
            const receivedText = context.activity.text;
            const attachments = context.activity.attachments;

            // Initialize the controller for CosmosDB
            await this.userController.init();

            if (attachments) {
                for (let i = 0; i < attachments.length; i++) {
                    const attachment = attachments[i];

                    if (!attachment.contentType.includes("image/"))
                        continue;

                    console.log(attachment.contentUrl);

                    const response = (await this.contentModerator.checkImage(attachment.contentUrl)).data;
                    if (response.IsImageAdultClassified || response.IsImageRacyClassified) {
                        // Doesn't work due to Azure-Telegram integration bug
                        // await context.deleteActivity(context.activity.id);
                        await context.sendActivity(MessageFactory.text("Non è il caso di inviare questo tipo di immagini..."));
                    }
                }
            }

            if (receivedText) {
                const response = (await this.contentModerator.checkText(receivedText)).data
                let replyText = "";

                if(response.PII)
                    if (response.PII.Address || response.PII.Phone || response.PII.Email)
                        replyText = `Per favore, non condividere in chat informazioni personali.\n\n`;

                if (response.Terms)
                    replyText += `Hai ricevuto un avvertimento per aver scritto parolacce, offese o altro. Al prossimo verrai bannato.\n\n`

                if (response.Classification)
                    if (response.Classification.ReviewRecommended)
                        replyText += `Hai ricevuto un avvertimento. Ti ricordiamo che è fondamentale che tu utilizzi un linguaggio appropriato in chat. Al prossimo avvertimento, verrai bannato.`;


                if(replyText != "") {
                    // await context.deleteActivity(context.activity.id);
                    // Doesn't work due to Azure-Telegram integration bug
                    await context.sendActivity(MessageFactory.text(replyText));
                }
                    
            }

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

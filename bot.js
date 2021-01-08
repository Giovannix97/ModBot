// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

const { Attachment, ActivityHandler, MessageFactory, ActivityFactory, TurnContext } = require('botbuilder');
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

            await this._onAttachmentsReceived(context, attachments);

            await this._onTextReceived(context, receivedText);
          
            // Initialize the controller for CosmosDB
            await this.userController.init();
          
            // By calling next() you ensure that the next BotHandler is run.
            await next();
        });

        this.onEvent(async (context, next) => {
            // Handle only messages with attachments on Direct Line
            if (!context.activity.attachments) {
                console.warn("[WARN]: This message should be not here", context.activity);
                await next();
                return;
            }

            const attachments = context.activity.attachments;
            await this._onAttachmentsReceived(context, attachments);

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
    };

    /**
     * Perform logic on text to detect bad words and personal infos 
     * @param {TurnContext} context 
     * @param {string} receivedText 
     */
    async _onTextReceived(context, receivedText) {
        if (!receivedText || receivedText.trim() === "")
            return;

        const response = (await this.contentModerator.checkText(receivedText)).data;
        let replyText = "";

        if (response.PII)
            if (response.PII.Address || response.PII.Phone || response.PII.Email)
                replyText = `Per favore, non condividere in chat informazioni personali.\n\n`;

        if (response.Terms)
            replyText += `Hai ricevuto un avvertimento per aver scritto parolacce, offese o altro. Al prossimo verrai bannato.\n\n`

        if (response.Classification)
            if (response.Classification.ReviewRecommended)
                replyText += `Hai ricevuto un avvertimento. Ti ricordiamo che è fondamentale che tu utilizzi un linguaggio appropriato in chat. Al prossimo avvertimento, verrai bannato.`;

        if (replyText != "") {
            await context.sendActivity(MessageFactory.text(replyText));

            try {
                await context.deleteActivity(context.activity.id);
            } catch (e) {
                // If the channel does not support deleteActivity, a custom event will be triggered
                const deleteEvent = ActivityFactory.fromObject({ activity_id: context.activity.id });
                deleteEvent.type = 'custom.delete'
                await context.sendActivity(deleteEvent);
            }
        }
    }

    /**
     * Perform logic on attachments (only images) to detect adult content 
     * @param {TurnContext} context 
     * @param {Attachment[]} attachments 
     */
    async _onAttachmentsReceived(context, attachments) {
        if (!attachments)
            return;

        for (let i = 0; i < attachments.length; i++) {
            const attachment = attachments[i];

            if (!attachment.contentType.includes("image/"))
                continue;

            const response = (await this.contentModerator.checkImage(attachment.contentUrl)).data;
            if (response.IsImageAdultClassified || response.IsImageRacyClassified) {
                await context.sendActivity(MessageFactory.text("Il messaggio è stato eliminato. Motivo: Non puoi inviare questa immagine in quanto viola il regolamento"));
                
                try {
                    await context.deleteActivity(context.activity.id);
                } catch (e) {
                    // If the channel does not support deleteActivity, a custom event will be triggered
                    const deleteEvent = ActivityFactory.fromObject({ activity_id: context.activity.id });
                    deleteEvent.type = 'custom.delete'
                    await context.sendActivity(deleteEvent);
                }
            }
        }
    }
}

module.exports.ModBot = ModBot;

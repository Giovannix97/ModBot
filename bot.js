// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

const { Attachment, ActivityHandler, MessageFactory, ActivityFactory, TurnContext } = require('botbuilder');
const { ContentModerator } = require('./services/ContentModerator');
const { UserController } = require('./services/userController');
const { locales } = require('./locales');

class ModBot extends ActivityHandler {
     constructor() {
        super();
        // Field for the moderation service
        this.contentModerator = new ContentModerator();
        // Field for the persistence
        this.userController = new UserController();
        // Initialize the controller for CosmosDB
        this.userController.init();
        

        // See https://aka.ms/about-bot-activity-message to learn more about the message and other activity types.
        this.onMessage(async (context, next) => {        
            const receivedText = context.activity.text;
            const attachments = context.activity.attachments;

            const language = await this._onTextReceived(context, receivedText);

            await this._onAttachmentsReceived(context, attachments, language);
          
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
     * @returns {string} Language spoken by the user in the bot
     */
    async _onTextReceived(context, receivedText) {
        if (!receivedText || receivedText.trim() === "")
            return;

        const response = (await this.contentModerator.checkText(receivedText)).data;
        let replyText = "";

        if (response.PII)
            if (response.PII.Address || response.PII.Phone || response.PII.Email)
                replyText = locales[response.Language].reply_personal_info;
                
        // Azure Content Moderator service finds insults and forbidden language
        if (response.Classification) {
            if (response.Classification.ReviewRecommended)
                replyText += locales[response.Language].reply_classification;
        } else {
            if (response.Terms) {
                replyText += locales[response.Language].reply_dirty_words;
            }
        }

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

        return response.Language;
    }

    /**
     * Perform logic on attachments (only images) to detect adult content 
     * @param {TurnContext} context 
     * @param {Attachment[]} attachments 
     * @param {string} language Language spoken by the user in the bot
     */
    async _onAttachmentsReceived(context, attachments, language = "eng") {
        if (!attachments)
            return;

        for (let i = 0; i < attachments.length; i++) {
            const attachment = attachments[i];

            if (!attachment.contentType.includes("image/"))
                continue;

            const response = (await this.contentModerator.checkImage(attachment.contentUrl)).data;
            if (response.IsImageAdultClassified || response.IsImageRacyClassified) {
                await context.sendActivity(MessageFactory.text(locales[language].reply_bad_image));
                
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

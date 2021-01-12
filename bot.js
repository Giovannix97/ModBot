// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

const { Attachment, ActivityHandler, MessageFactory, ActivityFactory, TurnContext } = require('botbuilder');
const { ContentModerator } = require('./services/content-moderator');
const { UserManager } = require('./services/user-manager');
const { ChannelConversationManager } = require('./services/channel-conversation-manager');
const { locales } = require('./locales');
const { EntityBuilder } = require('./services/db/entity-builder');

const MAX_WARNINGS = 3;

class ModBot extends ActivityHandler {
    constructor() {
        super();
        // Field for the moderation service
        this.contentModerator = new ContentModerator();
        // Field for the persistence
        this.userManager = new UserManager();
        this.userManager.init();

        this.channelConversationManager = new ChannelConversationManager();
        this.channelConversationManager.init();

        // See https://aka.ms/about-bot-activity-message to learn more about the message and other activity types.
        this.onMessage(async (context, next) => {
            const receivedText = context.activity.text;
            const attachments = context.activity.attachments;

            // channelId from directLine or from supported channels
            const channelId = context.activity.channelData.channelId || context.activity.channelId;
            // channelId from directLine or from supported channels
            const conversationId = context.activity.channelData.conversationId || (context.activity.conversation.id + "|" + context.activity.from.id);

            let user = await this.userManager.find(channelId, context.activity.from.id);
            if (!user) {
                user = EntityBuilder.createUser(context.activity.from.id, channelId);
                await this.userManager.add(user);
            }

            let channelConversation = await this.channelConversationManager.findById(user.channel, conversationId);
            if (!channelConversation) {
                // If is the first time that user commint an infraction in this channel, then store it
                channelConversation = EntityBuilder.createChannelConversation(conversationId, context.activity.from.id, user.channel);
                await this.channelConversationManager.addChannelConversation(channelConversation);
            }

            if (channelConversation.isBanned)
                await this._deleteActivity(context);
            else {
                const language = await this._onTextReceived(context, receivedText, channelConversation);
                await this._onAttachmentsReceived(context, attachments, language, channelConversation);
            }

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
     * @param {ChannelConversation} channelConversation current conversation
     * @typedef {{id, user, channel, number_of_warning, isBanned, bannedUntil, last_messages}} ChannelConversation
     * @returns {string} Language spoken by the user in the bot
     */
    async _onTextReceived(context, receivedText, channelConversation) {
        if (!receivedText || receivedText.trim() === "")
            return;

        // Store the message sent for chat flooding detection
        this.channelConversationManager.addMessage(channelConversation, context.activity.localTimestamp || new Date(), "text", context.activity.text);

        const response = (await this.contentModerator.checkText(receivedText)).data;
        let replyText = "";

        if (response.PII)
            if (response.PII.Address || response.PII.Phone || response.PII.Email) {
                // No warnings for sharing personal info's
                replyText = locales[response.Language].reply_personal_info;
                await context.sendActivity(MessageFactory.text(replyText));
                return response.Language;
            }

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
            const isBanned = await this._warn(channelConversation);
            if (isBanned === true) {
                const user = context.activity.from.name || context.activity.from.id;
                replyText = user + locales[response.Language].ban_message;
            }

            await context.sendActivity(MessageFactory.text(replyText));

            await this._deleteActivity(context);
        }

        return response.Language;
    }

    /**
     * Perform logic on attachments (only images) to detect adult content 
     * @param {TurnContext} context 
     * @param {Attachment[]} attachments 
     * @param {string} language Language spoken by the user in the bot
     * @param {*} channelConversation
     */
    async _onAttachmentsReceived(context, attachments, language = "eng", channelConversation) {
        if (!attachments)
            return;

        for (let i = 0; i < attachments.length; i++) {
            const attachment = attachments[i];

            if (!attachment.contentType.includes("image/"))
                continue;

            // Store the message sent for chat flooding detection
            this.channelConversationManager.addMessage(channelConversation, context.activity.localTimestamp || new Date(), "attachment", attachment.contentUrl);

            const response = (await this.contentModerator.checkImage(attachment.contentUrl)).data;
            if (response.IsImageAdultClassified || response.IsImageRacyClassified) {
                let replyText;

                const isBanned = this._warn(channelConversation);
                if (isBanned === true) {
                    const user = context.activity.from.name || context.activity.from.id;
                    replyText = user + locales[response.Language].ban_message;
                }
                else
                    replyText = locales[language].reply_bad_image;
                
                await context.sendActivity(MessageFactory.text(replyText));

                await this._deleteActivity(context);
            }
        }
    }

    /**
     * Warn the channel conversation. 
     * If the number of warning is greater then MAX_WARNINGS the user'll be banned in this channel conversation
     * @param {*} channelConversation 
     * @returns {boolean} true if the user is now banned, false otherwise
     */
    async _warn(channelConversation) {
        if (channelConversation.number_of_warning + 1 > MAX_WARNINGS) {
            // Banned for one day
            await this.channelConversationManager.ban(channelConversation);
            return true;
        }
        else {
            await this.channelConversationManager.warn(channelConversation);
            return false;
        }
    }

    /**
     * Delete the activity in context
     * @param {TurnContext} context 
     */
    async _deleteActivity(context) {
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

module.exports.ModBot = ModBot;

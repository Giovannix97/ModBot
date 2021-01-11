"use strict";

const CosmosClient = require('@azure/cosmos').CosmosClient;
const { ChannelConversationDAO } = require('./db/ChannelConversationDAO');
const { EntityBuilder } = require('./db/EntityBuilder');

const QUEUE_LENGHT = 7;

/**
 * Provide methods to store information about channel conversation
 */
class ChannelConversationController {
    constructor(dbEndpoint, dbKey) {
        const _dbEndpoint = dbEndpoint || process.env.CosmosDbEndpoint;
        const _dbKey = dbKey || process.env.CosmosDbKey;

        if (!_dbEndpoint) throw ("Please provide a valid Cosmos DB endpoint");
        if (!_dbKey) throw ("Please provide a valid Cosmos DB key");

        this._cosmosClient = new CosmosClient({
            endpoint: _dbEndpoint,
            key: _dbKey
        })

        /**
         * Channel conversation DAO userd for interact with cosmos db
         * @private
         */
        this._channelConversationDAO = new ChannelConversationDAO(this._cosmosClient);
    }

    /**
     * Inizialize the controller. Should be called before any method
     */
    async init() {
        console.info("[INFO]: Initializing the controller...");
        await this._channelConversationDAO.init();
        console.info("[INFO]: Initializing the controller... Done!");
    }

    /**
     * Add a new channel conversation to db
     * @param {ChannelConversation} channelConversation
     * @typedef {{id, user, channel, number_of_warning, isBanned, bannedUntil, last_messages}} ChannelConversation
     * @returns the stored channel conversation
     */
    async addChannelConversation(channelConversation) {
        return await this._channelConversationDAO.create(channelConversation);
    }

    /**
     * Find a channel conversation by channel and conversationId
     * @param {'telegram' | 'discord' | 'twitch' | 'web'} channel 
     * @param {string} conversation The conversation id
     */
    async findById(channel, conversation) {
        return this._channelConversationDAO.findById(channel, conversation);
    }

    /**
     * Add a warn for the user in this conversation's channel
     * @param {ChannelConversation} channelConversation The channel conversation you want to warn
     * @typedef {{id, user, channel, number_of_warning, isBanned, bannedUntil, last_messages}} ChannelConversation
     */
    async warn(channelConversation) {
        channelConversation.number_of_warning += 1;

        await this._channelConversationDAO.update(channelConversation.id, channelConversation);
    }

    /**
     * Ban the user in this conversation's channel
     * @param {ChannelConversation} channelConversation The channel conversation you want to ban
     * @param {Date} until The ending date of the ban. Is one day by default
     * @typedef {{id, user, channel, number_of_warning, isBanned, bannedUntil, last_messages}} ChannelConversation
     */
    async ban(channelConversation, until) {
        channelConversation.isBanned = true;
        if (until)
            channelConversation.bannedUntil = until;
        else {
            // If until is not specified, by defaults user is banned for one day
            const bannedDate = new Date();
            bannedDate.setDate(bannedDate.getDate() + 1);
            channelConversation.bannedUntil = bannedDate;
        }

        await this._channelConversationDAO.update(channelConversation.id, channelConversation);
    }

    /**
     * Unban the user in this conversation's channel
     * @param {ChannelConversation} channelConversation The channel conversation you want to unban
     * @typedef {{id, user, channel, number_of_warning, isBanned, bannedUntil, last_messages}} ChannelConversation
     */
    async unban(channelConversation) {
        channelConversation.number_of_warning = 0;
        channelConversation.bannedUntil = null;
        channelConversation.isBanned = false;
        channelConversation.last_messages = [];
        await this._channelConversationDAO.update(channelConversation.id, channelConversation);
    }

    /**
     * Store a sent message on this channel's conversation
     * @param {ChannelConversation} channelConversation The channel conversation message belongs to
     * @param {Date} messageDate Message sent timestamp
     * @param {'text' | 'attachment' } messageType Message type
     * @param {string} messageContent Content of message. Must be an URL if type is 'attachment'.
     * @typedef {{id, user, channel, number_of_warning, isBanned, bannedUntil, last_messages}} ChannelConversation
     */
    async addMessage(channelConversation, messageDate, messageType, messageContent) {
        const message = EntityBuilder.createMessageInfo(messageType, messageDate, messageContent);

        console.log(channelConversation.last_messages.length);

        if (channelConversation.last_messages.length !== QUEUE_LENGHT)
            channelConversation.last_messages.push(message);
        else {
            // Replace the oldest message with this one
            channelConversation.last_messages.shift();
            channelConversation.last_messages[QUEUE_LENGHT - 1] = message;
        }

        await this._channelConversationDAO.update(channelConversation.id, channelConversation);
    }

    /**
     * Clear message queue for the specified channel conversation
     * @param {ChannelConversation} channelConversation The channel conversation you want clear
     * @typedef {{id, user, channel, number_of_warning, isBanned, bannedUntil, last_messages}} ChannelConversation
     */
    async clearMessages(channelConversation) {
        channelConversation.last_messages = [];
        await this._channelConversationDAO.update(channelConversation.id, channelConversation);
    }
}


module.exports.ChannelConversationController = ChannelConversationController;
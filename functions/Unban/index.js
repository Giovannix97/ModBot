const https = require('https');

const TELEGRAM_HOST = `api.telegram.org`;
const METHOD_NAME = `restrictChatMember`
const TELEGRAM_ENDPOINT = `/bot${process.env.TELEGRAM_TOKEN}/${METHOD_NAME}`

module.exports = async function (context, req) {
    const channel = req.params.channel;
    const userId = req.params.userId;

    if (!channel || !userId) {
        context.res = {
            status: 404
        }

        return;
    }

    try {
        const chatId = channel.split("|")[0];
        const response = await unbanOnTelegram(chatId, userId);
        context.res = { body: response }
    }
    catch (error) {
        context.res = { status: 500 }
    }
}

/**
 * Perform a request to unban a user on Telegram
 * @param {string | number} chatId Unique identifier for the chat which user belongs.
 * @param {string} userId Unique identifier for user to unban
 */
const unbanOnTelegram = (chatId, userId) => {
    const promotedPermission = {
        can_send_messages: true,
        can_send_media_messages: true,
        can_send_polls: true,
        can_send_other_messages: true,
        can_add_web_page_previews: true,
        can_change_info: false,
        can_invite_users: true,
        can_pin_messages: true
    }

    const requestOptions = {
        method: "GET",
        host: TELEGRAM_HOST,
        path: `${TELEGRAM_ENDPOINT}?chat_id=${chatId}&user_id=${userId}&permissions=${JSON.stringify(promotedPermission)}`,
    }

    return new Promise((resolve, reject) => {
        const request = https.get(requestOptions, response => response.on('data', data => resolve(data)));

        request.on('error', err => reject(err));

        request.end();
    });
}
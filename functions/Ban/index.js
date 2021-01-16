const https = require('https');

const TELEGRAM_HOST = `api.telegram.org`;
const TELEGRAM_ENDPOINT = `/bot${process.env.TELEGRAM_TOKEN}/restrictChatMember`

module.exports = async function (context, req) {
    context.log('JavaScript HTTP trigger function processed a request.');

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
        console.log(chatId);
        const response = await banOnTelegram(chatId, userId);
        context.res = { body: response }
    }
    catch(error) {
        context.res = { status: 500 }
    }
}

/**
 * Perform a request to ban on Telegram
 * @param {string | number} chatId 
 * @param {string} userId 
 */
const banOnTelegram = (chatId, userId) => {
    const restrictedPermission = {
        can_send_messages: false,
        can_send_media_messages: false,
        can_send_polls: false,
        can_send_other_messages: false,
        can_add_web_page_previews: false,
        can_change_info: false,
        can_invite_users: false,
        can_pin_messages: false
    }

    const requestOptions = {
        method: "GET",
        host: TELEGRAM_HOST,
        path: `${TELEGRAM_ENDPOINT}?chat_id=${chatId}&user_id=${userId}&permissions=${JSON.stringify(restrictedPermission)}`,
    }

    return new Promise((resolve, reject) => {
        const request = https.get(requestOptions, response => response.on('data', data => resolve(data)));

        request.on('error', err => reject(err));

        request.end();
    })
}
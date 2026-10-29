module.exports = {
    guildId: '1497196596662763580',

    autoRoleId: '1497207039422894151',
    rolePLId:   '1501690212827398175',
    roleENId:   '1497213401276092477',
    ticketStaffRoleId: '1497211344116519042',

    verifyChannelId: '1497196597207892012',
    proxyTicketEmoji: '\uD83C\uDFAB',
    devTicketEmoji: '\uD83C\uDFAB',

    channels: {
        pl: {
            konwerter:    '1501699363989356604',
            qc:           '1501699802738589706',
            visualSearch: '1501700275310956564',
            tracking:     '1501700750634651761',
            tickets:      '1501696553247571988',
            devTickets:   '1504437469557559497',
        },
        en: {
            konwerter:    '1501001540524183562',
            qc:           '1501002051096809492',
            visualSearch: '1501002302796988496',
            tracking:     '1501186060720410664',
            tickets:      '1501192287210836039',
            devTickets:   '1504437120515833966',
        },
    },

    // Nowe filmiki z TikToka / rolki z IG -> kanały ogłoszeń. Instagram wymaga tokenu w env (tokenEnv).
    socialFeed: [
        { platform: 'tiktok',    username: 'replug24.com',             lang: 'en', channelId: '1497241119795449926' },
        { platform: 'instagram', username: 'replug24',                 lang: 'en', channelId: '1497241816800563301', tokenEnv: 'IG_TOKEN_EN' },
        { platform: 'tiktok',    username: 'mmmmmcheesecake.replug24', lang: 'pl', channelId: '1501698520481136801' },
        { platform: 'tiktok',    username: 'kasjo_replug24',           lang: 'pl', channelId: '1501698520481136801' },
        { platform: 'instagram', username: 'mmmmmcheesecake',          lang: 'pl', channelId: '1501698783015206972', tokenEnv: 'IG_TOKEN_PL' },
    ],
};

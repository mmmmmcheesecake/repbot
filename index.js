const { Client, GatewayIntentBits, Partials } = require('discord.js');
require('dotenv').config();

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMessageReactions,
        GatewayIntentBits.GuildMembers,
    ],
    partials: [Partials.Message, Partials.Channel, Partials.Reaction],
});

client.once('clientReady', () => {
    console.log(`✅ Bot zalogowany jako ${client.user.tag}`);
});

require('./handlers/setup')(client);
require('./handlers/say')(client);
require('./handlers/autoRole')(client);
require('./handlers/reactionRoles')(client);
require('./handlers/linkConverter')(client);
require('./handlers/qcSearch')(client);
require('./handlers/tracking')(client);
require('./handlers/visualSearch')(client);
require('./handlers/tickets')(client);
require('./handlers/socialFeed')(client);
require('./handlers/saleFeed')(client);
require('./handlers/qcArchive')(client);

client.login(process.env.TOKEN);

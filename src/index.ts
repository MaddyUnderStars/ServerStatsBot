import "dotenv/config";
import fetch from "node-fetch";
import discord from "discord.js";

const SERVERS = process.env.SERVERS?.split(",");
if (!SERVERS) throw "You forgot to set SERVERS env var";

const ENDPOINT =
	"https://api.steampowered.com/IGameServersService/GetServerList/v1/";

const serverCache = new Map<string, ServerCache>();

const client = new discord.Client({ intents: [] });

client.on("ready", () => {
	console.log(`Ready as ${client.user?.username}`);

	checkServers();
});

client.login(process.env.DISCORD_TOKEN);

const getServer = async (addr: string): Promise<SteamServer | undefined> => {
	let url = new URL(ENDPOINT);
	url.searchParams.append("key", process.env.STEAM_TOKEN as string);
	url.searchParams.append("filter", `addr\\${addr}`);

	const json = (await fetch(url).then((res) =>
		res.json(),
	)) as GetServerListResponse;

	return json.response?.servers?.[0];
};

const checkServers = async () => {
	for (var i = 0; i < SERVERS.length; i++) {
		var server = SERVERS[i];

		const ret = await getServer(server);

		var cache = serverCache.get(server);
		serverCache.set(
			server,
			!!ret ? { ...ret, offline: false } : { offline: true },
		);
		if (!cache) continue;

		var alias = cache.name || server;

		await sendNotification(alias, cache, ret);
	}

	setTimeout(checkServers, parseInt(process.env.INTERVAL as string));
};

const sendNotification = async (
	name: string,
	old: ServerCache,
	actual?: SteamServer,
) => {
	const channel = (await client.channels.fetch(
		process.env.CHANNEL as string,
	)) as discord.TextChannel;

	var embed: discord.APIEmbed | undefined = undefined;

	if (!actual && !old.offline) {
		// server is newly offline
		embed = {
			color: 0xff0000,
			title: `The server has gone offline!`,
			description: name,
		};
	} else if (actual && old.offline) {
		// server is newly online
		embed = {
			color: 0x00ff00,
			title: "The server has come online!",
			description: name,
		};
	} else if (!actual) return;
	else if (actual.players != old.players) {
		embed = {
			color: 0x0000ff,
			title: `${actual.players}/${actual.max_players} : A player has ${
				actual.players > old.players! ? "joined" : "left"
			} the server`,
			description: `Playing \`${actual.map}\``,
			footer: {
				text: name,
			},
		};
	} else if (actual.map != old.map) {
		embed = {
			color: 0x00ffff,
			title: `The server has changed map`,
			description: `Now playing: \`${actual.map}\``,
			footer: {
				text: name,
			},
		};
	}

	if (!embed) return;
	await channel.send({ embeds: [embed] });
};

interface GetServerListResponse {
	response: {
		servers?: SteamServer[];
	};
}

interface SteamServer {
	addr: string;
	gameport: number;
	steamid: string;
	name: string;
	appid: number;
	gamedir: string;
	version: string;
	product: string;
	region: number;
	players: number;
	max_players: number;
	bots: number;
	map: string;
	secure: boolean;
	dedicated: boolean;
	os: string;
	gametype: string; // comma separated tag list
}

interface ServerCache extends Partial<SteamServer> {
	offline: boolean;
	currentMessage?: discord.Message;
}

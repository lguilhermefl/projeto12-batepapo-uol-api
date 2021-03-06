import express from 'express';
import { MongoClient, ObjectId } from "mongodb";
import dotenv from "dotenv";
import Joi from 'joi';
import dayjs from 'dayjs';
import cors from 'cors';
import { stripHtml } from "string-strip-html";
dotenv.config();

const app = express();
app.use(express.json());
app.use(cors());

const mongoClient = new MongoClient(process.env.MONGO_URI);
let db;

mongoClient.connect().then(() => {
	db = mongoClient.db("chat_uol");
});

setInterval(async () => {
	const minTime = Date.now() - 10000;

	await db.collection("participants")
		.find({ lastStatus: { $lt: minTime } })
		.forEach(async function (participant) {
			const from = participant.name;
			const time = dayjs().format("HH:mm:ss");
			await db.collection("messages")
				.insertOne({ from, to: "Todos", text: 'sai da sala...', type: "status", time });
		});
	await db.collection("participants").deleteMany({ lastStatus: { $lt: minTime } });
}, 15000);

app.post('/participants', async (req, res) => {
	let name = stripHtml(req.body.name).result.trim();

	const schema = Joi.object({
		name: Joi.string()
			.required(),
	});

	const validation = schema.validate(req.body);

	if (validation.error) {
		const err = validation.error.details.map(detail => detail.message);
		res.status(422).send(err);
		return;
	}

	const isParticipantOnChat = await db.collection("participants").findOne({ name });

	if (isParticipantOnChat) {
		res.sendStatus(409);
		return;
	};

	try {
		const time = dayjs().format("HH:mm:ss");

		await db.collection("participants").insertOne({ name, lastStatus: Date.now() });
		await db.collection("messages").insertOne({ from: name, to: 'Todos', text: 'entra na sala...', type: 'status', time });

		res.sendStatus(201);
	} catch (err) {
		console.error(err);
		res.sendStatus(500);
	}
});

app.get('/participants', async (req, res) => {
	try {
		const participants = await db.collection("participants").find().toArray();
		res.status(200).send(participants);
	} catch (err) {
		console.error(err);
		res.sendStatus(500);
	}
});

app.post('/messages', async (req, res) => {
	const user = stripHtml(req.headers.user).result.trim();
	const isParticipantOnChat = await db.collection("participants").findOne({ name: user });

	if (!isParticipantOnChat) {
		res.sendStatus(422);
		return;
	}

	const schema = Joi.object({
		from: Joi.string()
			.required(),
		to: Joi.string()
			.required(),
		text: Joi.string()
			.required(),
		type: Joi.string()
			.valid("message", "private_message")
			.required()
	});

	const validation = schema.validate({ from: user, ...req.body }, { abortEarly: false });

	if (validation.error) {
		const err = validation.error.details.map(detail => detail.message);
		res.status(422).send(err);
		return;
	}

	const message = {
		from: user,
		to: stripHtml(req.body.to).result.trim(),
		text: stripHtml(req.body.text).result.trim(),
		type: stripHtml(req.body.type).result.trim()
	}

	try {
		const time = dayjs().format("HH:mm:ss");

		await db.collection("messages").insertOne({ ...message, time });

		res.sendStatus(201);
	} catch (err) {
		console.error(err);
		res.sendStatus(500);
	}
});

app.get('/messages', async (req, res) => {
	let limit = parseInt(req.query.limit);
	const user = stripHtml(req.headers.user).result.trim();

	if (!limit) {
		limit = 0;
	}

	try {
		const allMessages = await db.collection("messages")
			.find({
				$or: [
					{ to: 'Todos' },
					{ type: 'message' },
					{ from: user },
					{ to: user },
				],
			})
			.limit(limit)
			.toArray();

		res.status(200).send(allMessages);
	} catch (err) {
		console.error(err);
		res.sendStatus(500);
	}
});

app.post('/status', async (req, res) => {
	const user = stripHtml(req.headers.user).result.trim();
	const isParticipantOnChat = await db.collection("participants").findOne({ name: user });

	if (!isParticipantOnChat) {
		res.sendStatus(404);
		return;
	}
	try {
		await db.collection("participants").updateOne({ name: user }, { $set: { lastStatus: Date.now() } });
		res.sendStatus(200);
	} catch (err) {
		console.error(err);
		res.sendStatus(500);
	}
});

app.delete('/messages/:id', async (req, res) => {
	const id = stripHtml(req.params.id).result.trim();
	const user = stripHtml(req.headers.user).result.trim();

	const message = await db.collection("messages").findOne({ _id: new ObjectId(id) });

	if (!message) {
		res.sendStatus(404);
		return;
	}

	if (message.from !== user) {
		res.sendStatus(401);
		return;
	}

	try {
		await db.collection("messages").deleteOne({ _id: new ObjectId(id) });
		res.sendStatus(200);
	} catch (err) {
		console.error(err);
		res.sendStatus(500);
	}
});

app.put('/messages/:id', async (req, res) => {
	const id = stripHtml(req.params.id).result.trim();
	const user = stripHtml(req.headers.user).result.trim();

	const schema = Joi.object({
		from: Joi.string()
			.required(),
		to: Joi.string()
			.required(),
		text: Joi.string()
			.required(),
		type: Joi.string()
			.valid("message", "private_message")
			.required()
	});

	const validation = schema.validate({ from: user, ...req.body }, { abortEarly: false });

	if (validation.error) {
		const err = validation.error.details.map(detail => detail.message);
		res.status(422).send(err);
		return;
	}

	const newMessage = {
		from: user,
		to: stripHtml(req.body.to).result.trim(),
		text: stripHtml(req.body.text).result.trim(),
		type: stripHtml(req.body.type).result.trim()
	}

	const message = await db.collection("messages").findOne({ _id: new ObjectId(id) });

	if (!message) {
		res.sendStatus(404);
		return;
	}

	if (message.from !== user) {
		res.sendStatus(401);
		return;
	}

	try {
		const time = dayjs().format("HH:mm:ss");

		await db.collection("messages").updateOne({
			_id: message._id
		}, { $set: { ...newMessage, time } });

		res.sendStatus(200);
	} catch (err) {
		console.error(err);
		res.sendStatus(500);
	}
});

app.listen(5000);
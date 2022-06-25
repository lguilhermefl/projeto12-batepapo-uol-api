import express from 'express';
import { MongoClient } from "mongodb";
import dotenv from "dotenv";
import Joi from 'joi';
import dayjs from 'dayjs';
import cors from 'cors';
dotenv.config();

const app = express();
app.use(express.json());
app.use(cors());

const mongoClient = new MongoClient(process.env.MONGO_URI);
let db;

mongoClient.connect().then(() => {
	db = mongoClient.db("chat_uol");
});

app.post('/participants', async (req, res) => {
	let name = req.body.name;

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

	const isParticipantOnChat = await db.collection("participants").findOne(req.body);

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
		res.send(participants);
	} catch (err) {
		console.error(err);
		res.sendStatus(500);
	}
});

app.post('/messages', async (req, res) => {
	const user = req.headers.user;
	const isParticipantOnChat = await db.collection("participants").findOne({ name: user });

	if (!isParticipantOnChat) {
		res.sendStatus(422);
		return;
	}

	const message = {
		from: user,
		...req.body
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

	const validation = schema.validate(message, { abortEarly: false });

	if (validation.error) {
		const err = validation.error.details.map(detail => detail.message);
		res.status(422).send(err);
		return;
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

app.get('/messages', (req, res) => {

});

app.listen(5000);
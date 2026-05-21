const express = require('express');
const app = express();
const cors = require('cors');
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');

const dotenv = require('dotenv');
const { createRemoteJWKSet, jwtVerify } = require('jose-cjs');

dotenv.config();
app.use(cors());
app.use(express.json());

const port = process.env.PORT || 8080;


const uri = process.env.MONGODB_URI;
const JWKS = createRemoteJWKSet(new URL(`${process.env.CLIENT_URL}/api/auth/jwks`));
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  }
});

const logger = (req, res, next) => {
    console.log(`${req.method} ${req.url}`);
    next();
}

const normalizeTutorData = (data) => ({
    ...data,
    totalSlot: Number(data.totalSlot),
    hourlyFee: Number(data.hourlyFee),
});

const verifyToken = async (req, res, next) => {
    const authorization = req.headers.authorization;
    const token = authorization?.split(' ')[1];

    if (!token) {
        return res.status(401).json({ message: 'Unauthorized access' });
    }

    try {
        const JWKS = createRemoteJWKSet(
        new URL('http://localhost:3000/api/auth/jwks')
        )
        const { payload } = await jwtVerify(token, JWKS)
        req.user = payload;

        next();
        // console.log('Token is valid:', payload)
    } catch (error) {
        console.error('Token validation failed:', error)
        return res.status(401).json({ message: 'Unauthorized access' });
    }

    // console.log(req.headers);
    // next();
}

async function run() {
  try {
    // Connect the client to the server	(optional starting in v4.7)
    await client.connect();
    // Send a ping to confirm a successful connection
    await client.db("admin").command({ ping: 1 });
    console.log("Pinged your deployment. You successfully connected to MongoDB!");
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();

    const db = client.db('teacherkhujidb');
    const collection = db.collection('teachers');
    const bookingCollection = db.collection('bookings');

    app.get('/tutors', async (req, res) => {
        console.log(req.query)
        const cursor = collection.find();
        const tutors = await cursor.toArray();
        res.send(tutors);
      
    });

    app.get('/tutors/addedBy/:email', async (req, res) => {
        const { email } = req.params;
        const tutors = await collection.find({ addedBy: email }).toArray();
        res.send(tutors);
    });

    app.get('/availabletutors', async (req, res) => {
        const cursor = collection.find().limit(6);
        const tutors = await cursor.toArray();
        res.send(tutors);
      
    });

    app.get('/tutors/:id', logger, verifyToken, async (req, res) => {
        const id = req.params.id;
        query = {_id: new ObjectId(id)};
        const result = await collection.findOne(query);
        res.send(result);
    });

    app.patch('/booking/:tutorid', async (req, res) => {
        const tutorid = req.params.tutorid;
        const tutor = await collection.findOne({_id: new ObjectId(tutorid)});
        if (!tutor) {
            return res.status(404).json({ message: 'Tutor not found' });
        }

        const currentTotalSlot = Number(tutor.totalSlot);

        if (Number.isNaN(currentTotalSlot)) {
            return res.status(400).json({ message: 'Tutor totalSlot must be numeric' });
        }

        if (currentTotalSlot <= 0) {
            return res.status(400).json({ message: 'No available slots left' });
        }

        await collection.updateOne(
            { _id: new ObjectId(tutorid) },
            { $set: { totalSlot: currentTotalSlot - 1 } }
        );

        const bookingData = req.body;
        // console.log(bookingData);

        const result = await bookingCollection.insertOne({
            ...bookingData,
            bookedAt: new Date(),
        });
        res.send(result);
    });

    app.get('/bookings/:userId', async (req, res) => {
        const { userId } = req.params;
        const result = await bookingCollection.find({ studentId: userId }).toArray();
        res.send(result);
    });

    app.post('/tutors', async (req, res) => {
        const tutorData = normalizeTutorData(req.body);
        const result = await collection.insertOne(tutorData);
        res.send(result);
    });

    app.patch('/tutors/:id', verifyToken, async (req, res) => {
        const id = req.params.id;
        const updateData = normalizeTutorData(req.body);
        const result = await collection.updateOne(
            { _id: new ObjectId(id) },
            { $set: updateData }
        );
        res.send(result);
    });

    
}
}
run().catch(console.dir);


app.listen(port, () => {
  console.log(`Example app listening at http://localhost:${port}`);
}
);

// teacherkhuji
// 1q6lcb7EmOC507w3
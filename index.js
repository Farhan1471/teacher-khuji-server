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
    } catch (error) {
        return res.status(401).json({ message: 'Unauthorized access' });
    }
}

async function run() {
  try {
    const db = client.db('teacherkhujidb');
    const collection = db.collection('teachers');
    const bookingCollection = db.collection('bookings');

    app.get('/tutors', async (req, res) => {
        const cursor = collection.find();
        const tutors = await cursor.toArray();
        res.send(tutors);
      
    });

    app.get('/tutors/search', async (req, res) => {
        const { name } = req.query;
        const query = { name: { $regex: name, $options: 'i' } };
        const tutors = await collection.find(query).toArray();
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

    app.get('/tutors/session-start/filter', async (req, res) => {
        const { startDate, endDate } = req.query;
        const query = {};

        if (startDate || endDate) {
            query.sessionStartDate = {};
            if (startDate) query.sessionStartDate.$gte = startDate;
            if (endDate) query.sessionStartDate.$lte = endDate;
        }

        const tutors = await collection.find(query).toArray();
        res.send(tutors);
    });

    // app.get('/tutors/:id', logger, verifyToken, async (req, res) => {
    app.get('/tutors/:id', logger, async (req, res) => {
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

        const result = await bookingCollection.insertOne({
            ...bookingData,
            status: 'booked',
            bookedAt: new Date(),
        });
        res.send(result);
    });

    app.get('/bookings/:userId', async (req, res) => {
        const { userId } = req.params;
        const result = await bookingCollection.find({ studentId: userId }).toArray();
        res.send(result);
    });

    app.patch('/bookings/:id/cancel', async (req, res) => {
        const { id } = req.params;
        const result = await bookingCollection.updateOne(
            { _id: new ObjectId(id) },
            { $set: { status: 'cancelled' } }
        );

        res.send(result);
    });

    app.post('/tutors', async (req, res) => {
        const tutorData = normalizeTutorData(req.body);
        const result = await collection.insertOne(tutorData);
        res.send(result);
    });

    // app.patch('/updatetutors/:id', verifyToken, async (req, res) => {
    app.patch('/updatetutors/:id', async (req, res) => {
        const id = req.params.id;
        
            if (!ObjectId.isValid(id)) {
                return res.status(400).json({ message: 'Invalid tutor id' });
            }

            const tutor = await collection.findOne({
                _id: new ObjectId(id),
                // addedBy: req.user?.email,
            });

            if (!tutor) {
                return res.status(404).json({ message: 'Tutor not found or you don\'t have permission to update' });
            }

            const updateData = normalizeTutorData(req.body);
            
            delete updateData._id;
            delete updateData.addedBy;
            
            const result = await collection.updateOne(
                { _id: new ObjectId(id) },
                { $set: updateData }
            );
            res.send(result);
    });

    // app.patch('/tutors/:id', verifyToken, async (req, res) => {
    app.patch('/tutors/:id', async (req, res) => {
        const id = req.params.id;
        const updateData = normalizeTutorData(req.body);
        const result = await collection.updateOne(
            { _id: new ObjectId(id) },
            { $set: updateData }
        );
        res.send(result);
    });
 
    // app.delete('/tutors/:id', verifyToken, async (req, res) => {
    app.delete('/tutors/:id', async (req, res) => {
        const { id } = req.params;
        if (!ObjectId.isValid(id)) {
            return res.status(400).json({ message: 'Invalid tutor id' });
        }

        const result = await collection.deleteOne({
            _id: new ObjectId(id),
            // addedBy: req.user?.email,
        });

        if (result.deletedCount === 0) {
            return res.status(404).json({ message: 'Tutor not found or not yours' });
        }

        res.send({ message: 'Tutor deleted successfully' });
    }); 

    
    console.log("Pinged your deployment. You successfully connected to MongoDB!");
  } finally {
    // await client.close();
  }
}
run().catch(console.dir);


app.listen(port, () => {
  console.log(`Example app listening at http://localhost:${port}`);
}
);
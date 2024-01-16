
const express = require('express')
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
// calls-75-4 jsonwevtoken setup 
const jwt= require('jsonwebtoken')

require('dotenv').config()
// require('dotenv').config()
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);


const app = express()
const cors = require('cors')
const port = process.env.PORT || 5000

// middiewarer 
app.use(cors())
app.use(express.json())

// DB_USER=doctorsProtalsFive-server
// DB_PASS=doctorsProtalsFive-server
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.fm710lc.mongodb.net/?retryWrites=true&w=majority`;
console.log(uri)
const client = new MongoClient(uri, {
    serverApi: {
        version: ServerApiVersion.v1,
        strict: true,
        deprecationErrors: true,
    }
});


function verifyJWT(req, res, next) {

    const authHeader = req.headers.authorization;
    if (!authHeader) {
        return res.status(401).send('unauthorized access');
    }

    const token = authHeader.split(' ')[1];

    jwt.verify(token, process.env.ACCESS_TOKEN, function (err, decoded) {
        if (err) {
            return res.status(403).send({ message: 'forbidden access' })
        }
        req.decoded = decoded;
        next();
    })

}



// dotenv crud mongodb example

async function run() {
    try {
        const appointmentOptionCollextion = client.db('doctorprotailfive-main').collection('adersoptions')
        const bookingsCollextion=client.db('doctorprotailfive-main').collection('bookings')
        const userCollextion=client.db('doctorprotailfive-main').collection('users')
        const doctorCollextion=client.db('doctorprotailfive-main').collection('doctors')
        const paymentSCollectin=client.db('doctorprotailfive-main').collection('payments')


// NOTE  make sure you use verfyAdmin after verityJWt  class 76-9
const  verifyAdmin =async (req,res,next)=>{

    const decodedEmail = req.decoded.email;
    const query = { email: decodedEmail };
    const user = await userCollextion.findOne(query);

    if (user?.role !== 'admin') {
        return res.status(403).send({ message: 'forbidden access' })
    }
    next();    
}


        app.get('/appointmentOptions', async (req, res) => {


            // Use Aggregate to query multiple collection and then merge data

            const date = req.query.date;
            const query = {};
            const options = await appointmentOptionCollextion.find(query).toArray();

            // get the bookings of the provided date
            const bookingQuery = { appointmentDate: date }
            const alreadyBooked = await bookingsCollextion.find(bookingQuery).toArray();

            // code carefully :D
            options.forEach(option => {
                const optionBooked = alreadyBooked.filter(book => book.treatment === option.name);
                const bookedSlots = optionBooked.map(book => book.slot);
                const remainingSlots = option.slots.filter(slot => !bookedSlots.includes(slot))
                option.slots = remainingSlots;
                console.log(remainingSlots.length)
            })
            res.send(options);
        });

        app.get('/v2/appointmentOptions', async (req, res) => {
            const date = req.query.date;
            const options = await appointmentOptionCollextion.aggregate([
                {
                    $lookup: {
                        from: 'bookings',
                        localField: 'name',
                        foreignField: 'treatment',
                        pipeline: [
                            {
                                $match: {
                                    $expr: {
                                        $eq: ['$appointmentDate', date]
                                    }
                                }
                            }
                        ],
                        as: 'booked'
                    }
                },
                {
                    $project: {
                        name: 1,
                        price:1,
                        slots: 1,
                        booked: {
                            $map: {
                                input: '$booked',
                                as: 'book',
                                in: '$$book.slot'
                            }
                        }
                    }
                },
                {
                    $project: {
                        name: 1,
                        price:1,
                        slots: {
                            $setDifference: ['$slots', '$booked']
                        }
                    }
                }
            ]).toArray();
            res.send(options);
        })

        /// class 76-2   one data loade  (name)
app.get('/appointmentSpecialty',async(req,res)=>{
    const query ={};
    const result =await appointmentOptionCollextion.find(query).project({name:1}).toArray();
    res.send(result)
})

        app.get('/bookings', verifyJWT, async (req, res) => {
            const email = req.query.email;
            const decodedEmail = req.decoded.email;

            if (email !== decodedEmail) {
                return res.status(403).send({ message: 'forbidden access' });
            }

            const query = { email: email };
            const bookings = await bookingsCollextion.find(query).toArray();
            res.send(bookings);
        })

        // class 77-2 payment system setup and 
        app.get('/bookings/:id', async (req, res) => {
            const id = req.params.id;
            const query = { _id: new ObjectId(id) };
            const booking = await bookingsCollextion.findOne(query);
            res.send(booking);
        })

        // class 77-2 payment system setup and 


        app.post('/bookings', async (req, res) => {
            const booking = req.body;
            console.log(booking);
            const query = {
                appointmentDate: booking.appointmentDate,
                email: booking.email,
                treatment: booking.treatment
            }

            const alreadyBooked = await bookingsCollextion.find(query).toArray();

            if (alreadyBooked.length) {
                const message = `You already have a booking on ${booking.appointmentDate}`
                return res.send({ acknowledged: false, message })
            }

            const result = await bookingsCollextion.insertOne(booking);
            res.send(result);
        });

//class 77-6 payments getawy add and setup ok 


app.post('/create-payment-intent', async (req, res) => {
    const booking = req.body;
    const price = booking.price;
    const amount = price * 100;

    const paymentIntent = await stripe.paymentIntents.create({
        currency: 'usd',
        amount: amount,
        "payment_method_types": [
            "card"
        ]
    });
    res.send({
        clientSecret: paymentIntent.client_secret,
    });
});

// app.post('/payments', async (req, res) =>{
//     const payment = req.body;
//     const result = await paymentSCollectin.insertOne(payment);
//     const id = payment.bookingId
//     const filter = { _id: new ObjectId(id) };
//     const updatedDoc = {
//         $set: {
//             paid: true,
//             transactionId: payment.transactionId
//         }
//     }
//     const updatedResult = await bookingsCollextion.updateOne(filter, updatedDoc)
//     res.send(result);
// })

// new    code 
app.post('/payments', async (req, res) => {
    const payment = req.body;
    const result = await paymentSCollectin.insertOne(payment);
    const id = payment.bookingId
    const filter = { _id: new ObjectId(id) }
    const updatedDoc = {
        $set: {
            paid: true,
            transactionId: payment.transactionId
        }
    }
    const updatedResult = await bookingsCollextion.updateOne(filter, updatedDoc)
    res.send(result);
})










        app.get('/jwt', async (req, res) => {
            const email = req.query.email;
            const query = { email: email };
            const user = await userCollextion.findOne(query);
            if (user) {
                const token = jwt.sign({ email }, process.env.ACCESS_TOKEN, { expiresIn: '1h' })
                return res.send({ accessToken: token });
            }
            res.status(403).send({ accessToken: '' })
        });

        app.get('/users', async (req, res) => {
            const query = {};
            const users = await userCollextion.find(query).toArray();
            res.send(users);
        });

        app.get('/users/admin/:email', async (req, res) => {
            const email = req.params.email;
            const query = { email }
            const user = await userCollextion.findOne(query);
            res.send({ isAdmin: user?.role === 'admin' });
        })
        // shakil1@gmail.com
        app.post('/users', async (req, res) => {
            const user = req.body;
            console.log(user);
            const result = await userCollextion.insertOne(user);
            res.send(result);
        });

        app.put('/users/admin/:id', verifyJWT,verifyAdmin, async (req, res) => {

            // class addminn commit 76-9
            // const decodedEmail = req.decoded.email;
            // const query = { email: decodedEmail };
            // const user = await userCollextion.findOne(query);

            // if (user?.role !== 'admin') {
            //     return res.status(403).send({ message: 'forbidden access' })
            // }

            const id = req.params.id;
            const filter = { _id: new ObjectId(id) }
            const options = { upsert: true };
            const updatedDoc = {
                $set: {
                    role: 'admin'
                }
            }
            const result = await userCollextion.updateOne(filter, updatedDoc, options);
            res.send(result);
        })

// class 77-1 tamproly to update price field on appointment option  
// app.get("/prices" ,async(req,res)=>{
//     const filter = {}
//     const options = {upsert: true}
//     const updatedDoc = {
//         $set: {
//             price:88
//         }
//     }
//     const result=await appointmentOptionCollextion.updateMany(filter,updatedDoc,options)
// res.send(result)
// })
// class 77-1 tamproly to update price field on appointment option  


        // manageDoctors  indisplay port One 
        app.get('/doctors', verifyJWT,verifyAdmin,async(req,res)=>{
            const query ={};
        
            const doctors= await doctorCollextion.find(query).toArray()
       res.send(doctors);
       
        })



        // add doctors collection and part one server 
         app.post('/doctors',verifyJWT,verifyAdmin,async(req,res)=>{
            const doctor=req.body;
            const result =await doctorCollextion.insertOne(doctor)
            res.send(result)
         })


         // doctors delete class 76-8 server 
         app.delete('/doctors/:id',verifyJWT,verifyAdmin, async (req, res) => {
            const id = req.params.id;
            const filter = ({_id:new ObjectId(id)});
            const result = await doctorCollextion.deleteOne(filter);
            res.send(result);
        })

    }
    finally {

    }
}
run().catch(console.log);

app.get('/', async (req, res) => {
    res.send('doctors portal server is running');
})

app.listen(port, () => console.log(`Doctors portal running on ${port}`))
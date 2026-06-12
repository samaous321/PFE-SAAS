import mongoose from "mongoose";

const dbConnection = async () => {
  try {
    const cnx = await mongoose.connect(process.env.MONGO_URI);

    console.log(`✅ Database connected: ${cnx.connection.host}`);
  } catch (error) {
    console.error(`Database Error: ${error.message}`);
    process.exit(1);
  }
};

export default dbConnection;
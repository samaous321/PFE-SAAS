import mongoose from 'mongoose';
import dotenv from 'dotenv';
import User from '../models/User.js';
import { ROLES } from '../constants/roles.js';

dotenv.config();

const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/pfe-app';

const checkUsers = async () => {
  try {
    await mongoose.connect(MONGO_URI);
    console.log('✅ Connected to MongoDB');

    const users = await User.find({}, 'email role tenantId').limit(10);
    console.log('\n📊 Utilisateurs existants:');
    users.forEach(u => {
      console.log(`- ${u.email}: ${u.role} (tenant: ${u.tenantId || 'N/A'})`);
    });

    // Compter par rôle
    const roleCounts = await User.aggregate([
      { $group: { _id: '$role', count: { $sum: 1 } } }
    ]);

    console.log('\n📈 Répartition des rôles:');
    roleCounts.forEach(r => {
      console.log(`- ${r._id}: ${r.count} utilisateur(s)`);
    });

    await mongoose.disconnect();
  } catch (error) {
    console.error('❌ Erreur:', error.message);
  }
};

checkUsers();
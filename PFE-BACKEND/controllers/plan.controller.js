import * as planService from "../services/plan.service.js";

export const getActivePlans = async (_req, res) => {
  try {
    const plans = await planService.getActivePlans();
    res.status(200).json(plans);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const getAll = async (_req, res) => {
  try {
    const plans = await planService.getAllPlans();
    res.status(200).json(plans);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const getOne = async (req, res) => {
  try {
    const plan = await planService.getPlanBySlug(req.params.slug);
    res.status(200).json(plan);
  } catch (error) {
    res.status(404).json({ error: error.message });
  }
};

export const create = async (req, res) => {
  try {
    const plan = await planService.createPlan(req.body, req.user);
    res.status(201).json(plan);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
};

export const update = async (req, res) => {
  try {
    const plan = await planService.updatePlan(req.params.slug, req.body, req.user);
    res.status(200).json(plan);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
};

export const remove = async (req, res) => {
  try {
    await planService.deletePlan(req.params.slug, req.user);
    res.status(200).json({ message: "Plan deleted successfully" });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
};

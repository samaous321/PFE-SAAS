import * as tenantService from "../services/tenant.service.js";

// CHECK if domain exists (public route - no auth required)
export const checkDomainExists = async (req, res) => {
  try {
    const { domain } = req.query;
    
    if (!domain) {
      return res.status(400).json({ error: "Domain parameter required" });
    }

    const exists = await tenantService.tenantDomainExists(domain);
    res.status(200).json({ exists, domain: domain.toLowerCase() });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// CREATE
export const create = async (req, res) => {
  try {
    const tenant = await tenantService.createTenant(req.body);
    res.status(201).json(tenant);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
};

// GET ALL
export const getAll = async (req, res) => {
  try {
    const hasPagination = req.query.page || req.query.limit;

    if (hasPagination) {
      const response = await tenantService.getAllTenantsPaginated({
        page: req.query.page,
        limit: req.query.limit
      });

      return res.status(200).json(response);
    }

    const tenants = await tenantService.getAllTenants();
    res.status(200).json(tenants);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// GET ONE
export const getOne = async (req, res) => {
  try {
    const tenant = await tenantService.getTenantById(req.params.id);
    res.status(200).json(tenant);
  } catch (error) {
    res.status(404).json({ error: error.message });
  }
};

// GET STATS
export const getStats = async (req, res) => {
  try {
    const stats = await tenantService.getTenantStats(req.params.id);
    res.status(200).json(stats);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
};

// GET QUOTA
export const getQuota = async (req, res) => {
  try {
    const quota = await tenantService.getTenantQuota(req.params.id);
    res.status(200).json(quota);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
};

export const getDetails = async (req, res) => {
  try {
    const details = await tenantService.getTenantDetailedStats(req.params.id, {
      page: req.query.page,
      limit: req.query.limit,
      sortBy: req.query.sortBy,
      sortDirection: req.query.sortDirection,
      search: req.query.search,
      range: req.query.range
    });
    res.status(200).json(details);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
};

export const updateQuota = async (req, res) => {
  try {
    const quota = await tenantService.updateTenantQuota(req.params.id, req.body, req.user);
    res.status(200).json(quota);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
};

// UPDATE
export const update = async (req, res) => {
  try {
    const tenant = await tenantService.updateTenant(
      req.params.id,
      req.body
    );
    res.status(200).json(tenant);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
};

// DELETE
export const remove = async (req, res) => {
  try {
    await tenantService.deleteTenant(req.params.id);
    res.status(200).json({ message: "Tenant deleted successfully" });
  } catch (error) {
    res.status(404).json({ error: error.message });
  }
};

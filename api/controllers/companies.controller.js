async function createCompany(req, res, next) {
  try {
    const { companyService } = req.app.locals.services;
    const payload = req.body || {};

    const created = await companyService.createCompany(payload, req.id);
    res.status(201).json(created);
  } catch (error) {
    next(error);
  }
}

function listCompanies(req, res, next) {
  try {
    const { companyService } = req.app.locals.services;
    const companies = companyService.listCompanies();
    res.status(200).json(companies);
  } catch (error) {
    next(error);
  }
}

async function updateCompany(req, res, next) {
  try {
    const { companyService } = req.app.locals.services;
    const updated = await companyService.updateCompany(req.params.id, req.body || {}, req.id);

    if (!updated) {
      const error = new Error('Company not found');
      error.statusCode = 404;
      error.code = 'company_not_found';
      throw error;
    }

    res.status(200).json(updated);
  } catch (error) {
    next(error);
  }
}

function getCompanyExtractionStatus(req, res, next) {
  try {
    const { companyService } = req.app.locals.services;
    const status = companyService.getCompanyExtraction(req.params.id);

    if (!status) {
      const error = new Error('Company not found');
      error.statusCode = 404;
      error.code = 'company_not_found';
      throw error;
    }

    res.status(200).json(status);
  } catch (error) {
    next(error);
  }
}

module.exports = {
  createCompany,
  listCompanies,
  updateCompany,
  getCompanyExtractionStatus
};

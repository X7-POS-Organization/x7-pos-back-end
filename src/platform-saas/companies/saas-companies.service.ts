import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { Company } from './entities/company.entity';
import { CompanyStatus } from './constants/company-status.enum';
import { Merchant } from '../merchants/entities/merchant.entity';
import { MerchantStatus } from '../merchants/constants/merchant-status.enum';
import { User } from '../users/entities/user.entity';
import { Customer } from 'src/core/business-partners/customers/entities/customer.entity';
import { Supplier } from 'src/core/business-partners/suppliers/entities/supplier.entity';
import { Configuration } from 'src/core/configuration/entity/configuration-entity';
import { CompanySubscription } from '../subscriptions/company-subscriptions/entities/company-subscription.entity';
import {
  SaasCompaniesQueryDto,
  SaasCompanyMerchantsQueryDto,
  UpdateSaasCompanyProfileDto,
} from './dtos/saas-company.dto';

@Injectable()
export class SaasCompaniesService {
  constructor(
    @InjectRepository(Company)
    private readonly companyRepo: Repository<Company>,
    @InjectRepository(Merchant)
    private readonly merchantRepo: Repository<Merchant>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    @InjectRepository(Customer)
    private readonly customerRepo: Repository<Customer>,
    @InjectRepository(Supplier)
    private readonly supplierRepo: Repository<Supplier>,
    @InjectRepository(Configuration)
    private readonly configurationRepo: Repository<Configuration>,
    @InjectRepository(CompanySubscription)
    private readonly companySubscriptionRepo: Repository<CompanySubscription>,
  ) {}

  async getStats() {
    const [
      totalCompanies,
      activeCompanies,
      suspendedCompanies,
      tenantConfigurations,
      activeConfigurations,
      systemProfiles,
      activeMerchants,
    ] = await Promise.all([
      this.companyRepo.count(),
      this.companyRepo.count({ where: { status: CompanyStatus.ACTIVE } }),
      this.companyRepo.count({ where: { status: CompanyStatus.SUSPENDED } }),
      this.configurationRepo.count(),
      this.configurationRepo.count({ where: { status: 'active' } }),
      this.userRepo.count(),
      this.merchantRepo.count({ where: { status: MerchantStatus.ACTIVE } }),
    ]);

    return {
      statusCode: 200,
      message: 'SaaS company statistics retrieved successfully',
      data: {
        totalCompanies,
        activeCompanies,
        suspendedCompanies,
        tenantConfigurations,
        activeConfigurations,
        systemProfiles,
        activeMerchants,
      },
    };
  }

  async listCompanies(query: SaasCompaniesQueryDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 50;

    const qb = this.companyRepo
      .createQueryBuilder('company')
      .orderBy('company.id', 'ASC');

    if (query.status && query.status.trim() && query.status !== 'all') {
      qb.andWhere('LOWER(company.status) = LOWER(:status)', {
        status: query.status.trim(),
      });
    }

    if (query.search && query.search.trim()) {
      const term = `%${query.search.trim().toLowerCase()}%`;
      qb.andWhere(
        "(LOWER(company.name) LIKE :term OR LOWER(COALESCE(company.tax_id, '')) LIKE :term OR LOWER(COALESCE(company.email, '')) LIKE :term)",
        { term },
      );
    }

    const allMatching = await qb.getMany();
    const companyIds = allMatching.map((c) => c.id);

    const [merchants, subscriptions] =
      companyIds.length > 0
        ? await Promise.all([
            this.merchantRepo.find({
              where: { companyId: In(companyIds) },
            }),
            this.companySubscriptionRepo.find({
              where: { company_id: In(companyIds) },
              relations: ['plan'],
              order: { id: 'DESC' },
            }),
          ])
        : [[], []];

    const merchantCountByCompany = new Map<number, number>();
    for (const m of merchants) {
      merchantCountByCompany.set(
        m.companyId,
        (merchantCountByCompany.get(m.companyId) ?? 0) + 1,
      );
    }

    const tierByCompany = new Map<
      number,
      { planId: number; planName: string }
    >();
    const tiersMap = new Map<number, { planId: number; planName: string }>();
    for (const sub of subscriptions) {
      if (sub.plan) {
        const tier = { planId: sub.plan.id, planName: sub.plan.name };
        tiersMap.set(tier.planId, tier);
        if (!tierByCompany.has(sub.company_id)) {
          tierByCompany.set(sub.company_id, tier);
        }
      }
    }

    let items = allMatching.map((c) => ({
      id: c.id,
      name: c.name,
      legalName: c.name,
      taxId: c.tax_id ?? null,
      email: c.email ?? null,
      phone: c.phone ?? null,
      city: c.city ?? null,
      country: c.country ?? null,
      status: c.status,
      baseCurrency: 'USD',
      subscriptionTier: tierByCompany.get(c.id) ?? null,
      merchantCount: merchantCountByCompany.get(c.id) ?? 0,
    }));

    if (query.tier && String(query.tier).trim() && query.tier !== 'all') {
      const tierId = Number(query.tier);
      items = items.filter((item) => item.subscriptionTier?.planId === tierId);
    }

    const total = items.length;
    const totalPages = Math.max(1, Math.ceil(total / limit));
    const offset = (page - 1) * limit;
    const pagedItems = items.slice(offset, offset + limit);

    return {
      statusCode: 200,
      message: 'SaaS companies retrieved successfully',
      data: pagedItems,
      meta: {
        total,
        page,
        limit,
        totalPages,
        tiers: Array.from(tiersMap.values()),
      },
    };
  }

  async getCompanyHub(companyId: number) {
    const company = await this.companyRepo.findOne({
      where: { id: companyId },
    });
    if (!company) {
      throw new NotFoundException(`Company #${companyId} not found`);
    }

    const [merchants, configurations] = await Promise.all([
      this.merchantRepo.find({ where: { companyId } }),
      this.configurationRepo.count({ where: { company: { id: companyId } } }),
    ]);

    const merchantIds = merchants.map((m) => m.id);
    const activeUsers =
      merchantIds.length > 0
        ? await this.userRepo.count({ where: { merchantId: In(merchantIds) } })
        : 0;

    const activeMerchants = merchants.filter(
      (m) => m.status === MerchantStatus.ACTIVE,
    ).length;

    return {
      statusCode: 200,
      message: 'Company hub retrieved successfully',
      data: {
        company: {
          id: company.id,
          name: company.name,
          legalName: company.name,
          taxId: company.tax_id ?? null,
          status: company.status,
          baseCurrency: 'USD',
          city: company.city ?? null,
          country: company.country ?? null,
        },
        stats: {
          totalMerchants: merchants.length,
          activeMerchants,
          activeUsers,
          configurations,
        },
      },
    };
  }

  async getCompanyProfile(companyId: number) {
    const company = await this.companyRepo.findOne({
      where: { id: companyId },
    });
    if (!company) {
      throw new NotFoundException(`Company #${companyId} not found`);
    }

    const [
      activeMerchantBranches,
      globalCorporateCustomers,
      authorizedMasterSuppliers,
    ] = await Promise.all([
      this.merchantRepo.count({
        where: { companyId, status: MerchantStatus.ACTIVE },
      }),
      this.customerRepo.count({ where: { companyId } }),
      this.supplierRepo.count({ where: { company_id: companyId } }),
    ]);

    return {
      statusCode: 200,
      message: 'Company profile retrieved successfully',
      data: {
        id: company.id,
        legalName: company.name,
        commercialName: company.name,
        taxId: company.tax_id ?? null,
        email: company.email ?? null,
        phone: company.phone ?? null,
        address: company.address ?? null,
        city: company.city ?? null,
        state: company.state ?? null,
        country: company.country ?? null,
        baseCurrency: 'USD',
        status: company.status,
        metrics: {
          activeMerchantBranches,
          globalCorporateCustomers,
          authorizedMasterSuppliers,
        },
      },
    };
  }

  async updateCompanyProfile(
    companyId: number,
    dto: UpdateSaasCompanyProfileDto,
  ) {
    const company = await this.companyRepo.findOne({
      where: { id: companyId },
    });
    if (!company) {
      throw new NotFoundException(`Company #${companyId} not found`);
    }

    if (dto.commercialName !== undefined) {
      company.name = dto.commercialName.trim();
    } else if (dto.legalName !== undefined) {
      company.name = dto.legalName.trim();
    }
    if (dto.taxId !== undefined) company.tax_id = dto.taxId.trim();
    if (dto.email !== undefined) company.email = dto.email.trim();
    if (dto.phone !== undefined) company.phone = dto.phone.trim();
    if (dto.address !== undefined) company.address = dto.address.trim();
    if (dto.city !== undefined) company.city = dto.city.trim();
    if (dto.state !== undefined) company.state = dto.state.trim();
    if (dto.country !== undefined) company.country = dto.country.trim();
    if (dto.status !== undefined) company.status = dto.status;

    await this.companyRepo.save(company);
    return this.getCompanyProfile(companyId);
  }

  async getCompanyConfigurations(companyId: number) {
    const company = await this.companyRepo.findOne({
      where: { id: companyId },
    });
    if (!company) {
      throw new NotFoundException(`Company #${companyId} not found`);
    }

    const configurations = await this.configurationRepo.find({
      where: { company: { id: companyId } },
      relations: ['merchant'],
      order: { updatedAt: 'DESC' },
    });

    const items = configurations.map((configuration) => {
      const configType = (configuration as Configuration & { type?: string })
        .type;
      const configurationType = configType ?? 'configuration';
      return {
        id: configuration.id,
        configurationType,
        configurationLabel: configurationType
          .replace(/[-_]/g, ' ')
          .replace(/\b\w/g, (c) => c.toUpperCase()),
        status: configuration.status ?? 'active',
        merchantId: configuration.merchant_id,
        merchantName:
          configuration.merchant?.name ??
          (configuration.merchant_id
            ? `Branch ${configuration.merchant_id}`
            : 'Company Default'),
        updatedAt:
          configuration.updatedAt instanceof Date
            ? configuration.updatedAt.toISOString()
            : configuration.updatedAt
              ? String(configuration.updatedAt)
              : new Date().toISOString(),
      };
    });

    const activeConfigurations = items.filter(
      (item) => item.status.toLowerCase() === 'active',
    ).length;
    const configurationTypes = new Set(
      items.map((item) => item.configurationType),
    ).size;

    return {
      statusCode: 200,
      message: 'Company configurations retrieved successfully',
      data: {
        summary: {
          totalConfigurations: items.length,
          activeConfigurations,
          configurationTypes,
        },
        items,
      },
    };
  }

  async listCompanyMerchants(
    companyId: number,
    query: SaasCompanyMerchantsQueryDto,
  ) {
    const company = await this.companyRepo.findOne({
      where: { id: companyId },
    });
    if (!company) {
      throw new NotFoundException(`Company #${companyId} not found`);
    }

    const merchants = await this.merchantRepo.find({
      where: { companyId },
      order: { id: 'ASC' },
    });

    const cities = Array.from(
      new Set(
        merchants.map((m) => m.city).filter((c): c is string => Boolean(c)),
      ),
    ).sort();

    let items = merchants.map((m) => ({
      id: m.id,
      name: m.name,
      branchCode: `BR-${String(m.id).padStart(3, '0')}`,
      email: m.email ?? null,
      phone: m.phone ?? null,
      address: m.address ?? null,
      city: m.city ?? null,
      state: m.state ?? null,
      country: m.country ?? null,
      timezone: m.timezone ?? null,
      status: m.status,
      companyId: m.companyId,
    }));

    if (query.status && query.status.trim() && query.status !== 'all') {
      const target = query.status.trim().toLowerCase();
      items = items.filter((m) => m.status.toLowerCase() === target);
    }

    if (query.city && query.city.trim() && query.city !== 'all') {
      const targetCity = query.city.trim().toLowerCase();
      items = items.filter((m) => (m.city ?? '').toLowerCase() === targetCity);
    }

    if (query.search && query.search.trim()) {
      const term = query.search.trim().toLowerCase();
      items = items.filter(
        (m) =>
          m.name.toLowerCase().includes(term) ||
          m.branchCode.toLowerCase().includes(term) ||
          (m.city ?? '').toLowerCase().includes(term) ||
          (m.email ?? '').toLowerCase().includes(term),
      );
    }

    return {
      statusCode: 200,
      message: 'Company merchants retrieved successfully',
      data: items,
      meta: {
        total: items.length,
        cities,
      },
    };
  }
}

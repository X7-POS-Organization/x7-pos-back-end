import { NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Customer } from 'src/core/business-partners/customers/entities/customer.entity';
import { Supplier } from 'src/core/business-partners/suppliers/entities/supplier.entity';
import { Configuration } from 'src/core/configuration/entity/configuration-entity';
import { Merchant } from '../merchants/entities/merchant.entity';
import { MerchantStatus } from '../merchants/constants/merchant-status.enum';
import { CompanySubscription } from '../subscriptions/company-subscriptions/entities/company-subscription.entity';
import { User } from '../users/entities/user.entity';
import { CompanyStatus } from './constants/company-status.enum';
import { Company } from './entities/company.entity';
import { SaasCompaniesService } from './saas-companies.service';

describe('SaasCompaniesService', () => {
  let service: SaasCompaniesService;

  const mockCompanyRepo = {
    count: jest.fn(),
    findOne: jest.fn(),
    save: jest.fn(),
    createQueryBuilder: jest.fn(),
  };

  const mockMerchantRepo = {
    count: jest.fn(),
    find: jest.fn(),
  };

  const mockUserRepo = {
    count: jest.fn(),
  };

  const mockCustomerRepo = {
    count: jest.fn(),
  };

  const mockSupplierRepo = {
    count: jest.fn(),
  };

  const mockConfigurationRepo = {
    count: jest.fn(),
    find: jest.fn(),
  };

  const mockCompanySubscriptionRepo = {
    find: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SaasCompaniesService,
        { provide: getRepositoryToken(Company), useValue: mockCompanyRepo },
        { provide: getRepositoryToken(Merchant), useValue: mockMerchantRepo },
        { provide: getRepositoryToken(User), useValue: mockUserRepo },
        { provide: getRepositoryToken(Customer), useValue: mockCustomerRepo },
        { provide: getRepositoryToken(Supplier), useValue: mockSupplierRepo },
        {
          provide: getRepositoryToken(Configuration),
          useValue: mockConfigurationRepo,
        },
        {
          provide: getRepositoryToken(CompanySubscription),
          useValue: mockCompanySubscriptionRepo,
        },
      ],
    }).compile();

    service = module.get<SaasCompaniesService>(SaasCompaniesService);
  });

  it('should return global SaaS company statistics', async () => {
    mockCompanyRepo.count
      .mockResolvedValueOnce(5)
      .mockResolvedValueOnce(3)
      .mockResolvedValueOnce(1);
    mockConfigurationRepo.count
      .mockResolvedValueOnce(4)
      .mockResolvedValueOnce(3);
    mockUserRepo.count.mockResolvedValueOnce(10);
    mockMerchantRepo.count.mockResolvedValueOnce(5);

    const result = await service.getStats();

    expect(result.statusCode).toBe(200);
    expect(result.data).toEqual({
      totalCompanies: 5,
      activeCompanies: 3,
      suspendedCompanies: 1,
      tenantConfigurations: 4,
      activeConfigurations: 3,
      systemProfiles: 10,
      activeMerchants: 5,
    });
  });

  it('should handle string updatedAt from PostgreSQL date column in getCompanyConfigurations', async () => {
    mockCompanyRepo.findOne.mockResolvedValue({ id: 1, name: 'Acme' });
    mockConfigurationRepo.find.mockResolvedValue([
      {
        id: 10,
        type: 'tax_rule',
        status: 'active',
        merchant_id: 2,
        merchant: { name: 'Main Branch' },
        updatedAt: '2026-11-23',
      },
    ]);

    const result = await service.getCompanyConfigurations(1);

    expect(result.statusCode).toBe(200);
    expect(result.data.summary).toEqual({
      totalConfigurations: 1,
      activeConfigurations: 1,
      configurationTypes: 1,
    });
    expect(result.data.items[0]).toMatchObject({
      id: 10,
      configurationType: 'tax_rule',
      merchantName: 'Main Branch',
      updatedAt: '2026-11-23',
    });
  });

  it('should throw NotFoundException when company does not exist', async () => {
    mockCompanyRepo.findOne.mockResolvedValue(null);

    await expect(service.getCompanyHub(999)).rejects.toThrow(NotFoundException);
    await expect(service.getCompanyProfile(999)).rejects.toThrow(
      NotFoundException,
    );
    await expect(service.getCompanyConfigurations(999)).rejects.toThrow(
      NotFoundException,
    );
    await expect(service.listCompanyMerchants(999, {})).rejects.toThrow(
      NotFoundException,
    );
  });

  it('should list company merchants with branchCode and city filter', async () => {
    mockCompanyRepo.findOne.mockResolvedValue({ id: 1, name: 'Acme' });
    mockMerchantRepo.find.mockResolvedValue([
      {
        id: 7,
        name: 'Downtown',
        email: 'dt@acme.com',
        phone: '123',
        address: 'Main 1',
        city: 'Miami',
        state: 'FL',
        country: 'USA',
        timezone: 'America/New_York',
        status: MerchantStatus.ACTIVE,
        companyId: 1,
      },
      {
        id: 8,
        name: 'North',
        email: 'n@acme.com',
        phone: '456',
        address: 'North 2',
        city: 'Orlando',
        state: 'FL',
        country: 'USA',
        timezone: 'America/New_York',
        status: MerchantStatus.ACTIVE,
        companyId: 1,
      },
    ]);

    const result = await service.listCompanyMerchants(1, { city: 'Miami' });

    expect(result.data).toHaveLength(1);
    expect(result.data[0].branchCode).toBe('BR-007');
    expect(result.meta.cities).toEqual(['Miami', 'Orlando']);
  });

  it('should update company profile fields and return updated profile', async () => {
    const entity = {
      id: 1,
      name: 'Old Name',
      tax_id: '111',
      email: 'old@acme.com',
      status: CompanyStatus.ACTIVE,
    };
    mockCompanyRepo.findOne.mockResolvedValue(entity);
    mockCompanyRepo.save.mockResolvedValue(entity);
    mockMerchantRepo.count.mockResolvedValue(2);
    mockCustomerRepo.count.mockResolvedValue(3);
    mockSupplierRepo.count.mockResolvedValue(1);

    const result = await service.updateCompanyProfile(1, {
      commercialName: 'New Name',
      taxId: '222',
    });

    expect(entity.name).toBe('New Name');
    expect(entity.tax_id).toBe('222');
    expect(result.data.commercialName).toBe('New Name');
  });
});

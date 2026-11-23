// src/platform-saas/companies/companies.module.ts
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CompaniesController } from './companies.controller';
import { CompaniesService } from './companies.service';
import { SaasCompaniesController } from './saas-companies.controller';
import { SaasCompaniesService } from './saas-companies.service';
import { Company } from './entities/company.entity';
import { Merchant } from '../merchants/entities/merchant.entity';
import { User } from '../users/entities/user.entity';
import { Customer } from 'src/core/business-partners/customers/entities/customer.entity';
import { Supplier } from 'src/core/business-partners/suppliers/entities/supplier.entity';
import { Configuration } from 'src/core/configuration/entity/configuration-entity';
import { CompanySubscription } from '../subscriptions/company-subscriptions/entities/company-subscription.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Company,
      Merchant,
      User,
      Customer,
      Supplier,
      Configuration,
      CompanySubscription,
    ]),
  ],
  controllers: [CompaniesController, SaasCompaniesController],
  providers: [CompaniesService, SaasCompaniesService],
  exports: [CompaniesService, SaasCompaniesService],
})
export class CompaniesModule {}

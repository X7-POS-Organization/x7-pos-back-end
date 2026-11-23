import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from 'src/auth/guards/jwt-auth.guard';
import { RolesGuard } from 'src/auth/guards/roles.guard';
import { Roles } from 'src/auth/decorators/roles.decorator';
import { Scopes } from 'src/auth/decorators/scopes.decorator';
import { UserRole } from '../users/constants/role.enum';
import { Scope } from '../users/constants/scope.enum';
import { SaasCompaniesService } from './saas-companies.service';
import {
  SaasCompaniesQueryDto,
  SaasCompanyMerchantsQueryDto,
  UpdateSaasCompanyProfileDto,
} from './dtos/saas-company.dto';

@ApiTags('Platform SaaS - Companies (v1)')
@ApiBearerAuth()
@Controller('v1/saas/companies')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.PORTAL_ADMIN, UserRole.PORTAL_USER, UserRole.MERCHANT_ADMIN)
@Scopes(
  Scope.ADMIN_PORTAL,
  Scope.MERCHANT_WEB,
  Scope.MERCHANT_ANDROID,
  Scope.MERCHANT_IOS,
  Scope.MERCHANT_CLOVER,
)
export class SaasCompaniesController {
  constructor(private readonly saasCompaniesService: SaasCompaniesService) {}

  @Get('stats')
  @ApiOperation({ summary: 'Get global SaaS company statistics' })
  getStats() {
    return this.saasCompaniesService.getStats();
  }

  @Get()
  @ApiOperation({ summary: 'List SaaS companies with filters and pagination' })
  listCompanies(@Query() query: SaasCompaniesQueryDto) {
    return this.saasCompaniesService.listCompanies(query);
  }

  @Get(':id/hub')
  @ApiOperation({ summary: 'Get hub overview for a specific company' })
  getCompanyHub(@Param('id', ParseIntPipe) id: number) {
    return this.saasCompaniesService.getCompanyHub(id);
  }

  @Get(':id/profile')
  @ApiOperation({ summary: 'Get profile for a specific company' })
  getCompanyProfile(@Param('id', ParseIntPipe) id: number) {
    return this.saasCompaniesService.getCompanyProfile(id);
  }

  @Patch(':id/profile')
  @ApiOperation({ summary: 'Update profile for a specific company' })
  updateCompanyProfile(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateSaasCompanyProfileDto,
  ) {
    return this.saasCompaniesService.updateCompanyProfile(id, dto);
  }

  @Get(':id/configurations')
  @ApiOperation({ summary: 'Get configurations for a specific company' })
  getCompanyConfigurations(@Param('id', ParseIntPipe) id: number) {
    return this.saasCompaniesService.getCompanyConfigurations(id);
  }

  @Get(':id/merchants')
  @ApiOperation({ summary: 'List merchants for a specific company' })
  listCompanyMerchants(
    @Param('id', ParseIntPipe) id: number,
    @Query() query: SaasCompanyMerchantsQueryDto,
  ) {
    return this.saasCompaniesService.listCompanyMerchants(id, query);
  }
}

import { Schema } from '../decorators/schema';
import { Field } from '../decorators/type';
import { Any } from '../metadata/var';
// tslint:disable-next-line:max-line-length
import { Class, Context, CpuInfo, InfoSchemaResolvers, ModuleInfo, NetworkInfo, PackageInfo, ProcessInfo, SchemaResolvers, ServiceInfo } from '../types/core';
import { Utils } from '../utils';

@Schema()
export class ServiceInfoSchema {
  @Field() mode: string;
  @Field() id: string;
  @Field(String) type: Class;
  @Field() value: string;
  @Field() global: boolean;
  @Field() transient: boolean;

  constructor(s: ServiceInfo) {
    this.id = Utils.label(s.id);
    this.mode = typeof s.id === 'string' ? s.type ? 'alias' : 'value' : 'type';
    this.type = Utils.label(s.type);
    this.value = Utils.label(s.value);
    this.global = !!s.global;
    this.transient = !!s.transient;
  }

  public static RESOLVERS: InfoSchemaResolvers<ServiceInfoSchema> = {};
}

@Schema()
export class InstanceInfoSchema {
  @Field() name: string;
  @Field() state: string;
  @Field(list => [ServiceInfoSchema]) context: ServiceInfoSchema[];

  public static get(ctx: Context) {
    return ctx.container;
  }

  public static RESOLVERS: InfoSchemaResolvers<InstanceInfoSchema, Context | any> = {
    context: (obj, args) => {
      const info = obj.serviceInfo().map((s: ServiceInfo) => new ServiceInfoSchema(s));
      if (args.target) args.target = `[class: ${args.target}]`;
      if (args.type) args.type = `[class: ${args.type}]`;
      return Utils.filter(info, args);
    }
  };
}

@Schema()
export class CpuInfoSchema implements CpuInfo {
  @Field() model: string;
  @Field() speed: number;
  @Field() user: number;
  @Field() nice: number;
  @Field() sys: number;
  @Field() idle: number;
  @Field() irq: number;
  public static RESOLVERS: InfoSchemaResolvers<CpuInfoSchema> = {};
}

@Schema()
export class NetworkInfoSchema implements NetworkInfo {
  @Field() name: string;
  @Field() address: string;
  @Field() netmask: string;
  @Field() family: string;
  @Field() mac: string;
  @Field() internal: boolean;
  @Field() cidr: string;
  public static RESOLVERS: InfoSchemaResolvers<NetworkInfoSchema> = {};
}

@Schema()
export class PackageInfoSchema implements PackageInfo {
  @Field() name: string;
  @Field() version: string;
  @Field() description: string;
  @Field() size: number;
  @Field() path: string;
  @Field(Any) json: any;
  @Field() level: number;
  @Field() moduleCount: number;
  @Field(ref => PackageInfoSchema) parent: PackageInfo;
  @Field(ref => ModuleInfoSchema) import: ModuleInfo;
  @Field(list => [ModuleInfoSchema]) modules: ModuleInfo[];
  @Field(list => [PackageInfoSchema]) imports: PackageInfo[];
  @Field(list => [PackageInfoSchema]) uses: PackageInfo[];

  public static RESOLVERS: SchemaResolvers<PackageInfoSchema> = {
    modules: (obj, args) => Utils.filter(obj.modules, args),
    imports: (obj, args) => Utils.filter(obj.imports, args),
    uses: (obj, args) => Utils.filter(obj.uses, args),
  };
}

@Schema()
export class ModuleInfoSchema implements ModuleInfo {
  @Field() id: string;
  @Field() name: string;
  @Field() file: string;
  @Field() size: number;
  @Field() level: number;
  @Field(ref => ModuleInfoSchema) parent: ModuleInfo;
  @Field(ref => PackageInfoSchema) package: PackageInfo;
}

@Schema()
export class ProcessInfoSchema implements ProcessInfo {
  // Function
  @Field() application: string;
  @Field() container: string;
  @Field() version: string;
  @Field() identity: string;
  // Stats
  @Field() created: Date;
  @Field() loadTime: number;
  @Field() initTime: number;
  // Runtime
  @Field() timestamp: Date;
  @Field() state: string;
  @Field() serial: number;
  @Field() uptime: number;
  // Usage
  @Field() memory: number;
  @Field() heapTotal: number;
  @Field() heapUsed: number;
  @Field() external: number;
  @Field() cpuUser: number;
  @Field() cpuSystem: number;
  @Field() cpuUserTotal: number;
  @Field() cpuSystemTotal: number;
  @Field() moduleCount: number;
  @Field() packageCount: number;
  @Field() scriptSize: number;
  // Instance
  // @Field() instance: string;
  @Field(Any) node: any;
  @Field(list => [CpuInfoSchema]) cpus: CpuInfo[];
  @Field(list => [NetworkInfoSchema]) networks: NetworkInfo[];
  // Package and code size
  @Field(ref => ModuleInfoSchema) entry: ModuleInfo;
  packages: PackageInfo[];
  modules: ModuleInfo[];
  public static RESOLVERS: SchemaResolvers<ProcessInfo> = {};
}

// TODO: Statistics .....

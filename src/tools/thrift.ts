import { ApiMetadata } from '../metadata/api';
import { DatabaseMetadata } from '../metadata/database';
import { EntityMetadata } from '../metadata/entity';
import { EnumMetadata } from '../metadata/enum';
import { Metadata } from '../metadata/registry';
import { RelationType } from '../metadata/relation';
import { TypeMetadata, TypeSelect } from '../metadata/type';
import { VarKind } from '../metadata/var';
import { Utils } from '../utils';

interface DatabaseSchema {
  metadata: DatabaseMetadata;
  name: string;
  alias: string;
  entities: Record<string, EntitySchema>;
  // query: string;
  // meta: string;
  // model: string;
  // root: Resolver;
  queries: Record<string, string>;
  mutations: Record<string, string>;
}

interface EntitySchema {
  metadata: EntityMetadata;
  name: string;
  query: string[];
  mutation: string[];
  model: string;
  inputs: string[];
  // search: string;
  // simple: string;
  // TODO: Remove
  // relations: Record<string, { target: string, type: string }>;
  // resolvers: Record<string, Resolver>;
}

interface Result {
  thrift: string;
  script: string;
  patch?: string;
  replace?: Record<string, string>;
}

const ENTITY = '';
const GET = 'get';
const SEARCH = 'query';
const ARGS = '';
const CREATE = 'create';
const UPDATE = 'update';
const REMOVE = 'remove';

const GEN = 'srv';

const RESERVED = ['required', 'optional', 'service', 'enum', 'extends', 'exception', 'struct', 'throws', 'string', 'bool', 'list', 'set'];

function esc(name: string) {
  return RESERVED.includes(name) ? '__esc_' + name : name;
}

export class ThriftCodeGen {

  protected crud: boolean = true;

  public static emit(name: string): Result {
    return new ThriftCodeGen().emit(name);
  }

  private constructor() { }

  public emit(name: string): Result {

    // tslint:disable:max-line-length

    const registry = Metadata.copy();
    const dbs = Object.values(registry.Database).sort((a, b) => a.name.localeCompare(b.name));
    const apis = Object.values(registry.Api).sort((a, b) => a.name.localeCompare(b.name));
    const enums = Object.values(registry.Enum).sort((a, b) => a.name.localeCompare(b.name));

    let thrift = this.prolog() + '\n';
    let script = this.genClass(name, dbs, apis);
    let patch = this.genPatch();
    let replace: any = {};

    thrift += '///////// API /////////\n\n';
    for (const api of apis) {
      const res = this.genApi(api);
      thrift += res.thrift + '\n\n';
      script += res.script + '\n';
      replace = { ...replace, ...res.replace };
    }
    thrift += '///////// ENUM ////////\n\n';
    for (const type of enums) {
      const res = this.genEnum(type);
      thrift += res.thrift + '\n\n';
      patch += res.patch || '';
      replace = { ...replace, ...res.replace };
    }
    thrift += '//////// INPUTS ///////\n\n';
    for (const type of Object.values(registry.Input).sort((a, b) => a.name.localeCompare(b.name))) {
      const res = this.genStruct(type);
      thrift += res.thrift + '\n\n';
      patch += res.patch || '';
      replace = { ...replace, ...res.replace };
    }
    thrift += '//////// TYPES ////////\n\n';
    for (const type of Object.values(registry.Type).sort((a, b) => a.name.localeCompare(b.name))) {
      const res = this.genStruct(type);
      thrift += res.thrift + '\n\n';
      patch += res.patch || '';
      replace = { ...replace, ...res.replace };
    }
    // const db = Object.values(this.schema.databases)[0];
    thrift += '/////// DATABASE //////\n\n';
    for (const type of dbs) {
      const res = this.genDatabase(type);
      thrift += res.thrift + '\n\n';
      script += res.script + '\n';
      replace = { ...replace, ...res.replace };
    }
    thrift += '//////// METADATA ////////\n\n';
    for (const type of Object.values(registry.Registry).sort((a, b) => a.name.localeCompare(b.name))) {
      const res = this.genStruct(type);
      thrift += res.thrift + '\n\n';
      patch += res.patch || '';
      replace = { ...replace, ...res.replace };
    }
    return { thrift, script, patch, replace };
  }

  private prolog(): string {
    return Utils.indent(`
      typedef string ID

      union Json {
        1: double N;
        2: string S;
        3: bool B;
        4: list<Json> L;
        5: map<string, Json> M;
      }

      struct Timestamp {
        1: i64 ms
      }

      // TODO: CoreException
    `).trimLeft();
  }

  private genEnum(meta: EnumMetadata): Result {
    let thrift = `enum ${meta.name} {`;
    let i = 0;
    for (const key of meta.options) {
      thrift += `${i ? ',' : ''}\n  ${esc(key)} = ${i}`; i++;
    }
    thrift += '\n}';
    // const patch = `  {\n  // ${meta.name}\n  }\n`;
    return { script: undefined, thrift };
  }

  private genStruct(meta: TypeMetadata): Result {
    let thrift = `struct ${meta.name} {`;
    let enmap = '';
    let demap = '';
    const replace: any = {};
    let index = 0;
    for (const field of Object.values(meta.members)) {
      const type = field.build;
      const opt = true; // GraphKind.isEntity(struc.kind) ? !field.required : true;
      thrift += `${index ? ',' : ''}\n  ${index + 1}: ${opt ? 'optional' : ''} ${type.idl} ${esc(field.name)}`;
      index++;
      if (!VarKind.isEnum(type.kind)) continue;
      enmap += `\nif (obj && typeof obj.${field.name} === 'string') obj.${field.name} = ${type.idl}[obj.${field.name} as any];`;
      demap += `\nif (obj && typeof obj.${field.name} === 'number') obj.${field.name} = ${type.idl}[obj.${field.name}];`;
      replace[`output.writeI32(obj.${field.name});`] = `output.writeI32(obj.${field.name} as number);`;
      replace[`: ${type.idl}`] = `: (${type.idl} | string)`;
    }
    thrift += `\n} (kind = "${meta.kind}")`;
    const patch = `
    {
      const codec = { ...${meta.name}Codec };
      ${meta.name}Codec.encode = (obj: I${meta.name}Args, output: thrift.TProtocol) => {
        ${Utils.indent(enmap.trim(), 8) || '// NOP'}
        codec.encode(obj, output);
      }
      ${meta.name}Codec.decode = (input: thrift.TProtocol): I${meta.name} => {
        const obj = codec.decode(input);
        ${Utils.indent(demap.trim(), 8) || '// NOP'}
        return obj;
      }
    }\n`;
    return { thrift, script: undefined, patch, replace };
  }

  // TODO: Patch return types in script
  private genPatch() {
    return Utils.indent(`
      /// Patch to support javascript Date and Json
      {
        const codec = { ...TimestampCodec };
        TimestampCodec.encode = (args: ITimestampArgs, output: thrift.TProtocol) => {
          if (args instanceof Date) args = { ms: args.getTime() };
          codec.encode(args, output);
        };
        TimestampCodec.decode = (input: thrift.TProtocol): ITimestamp => {
          const val = codec.decode(input);
          if (!val || val.ms === void 0) return val;
          const obj: any = new Date(+val.ms.toString());
          obj.ms = val.ms;
          return obj;
        };
      }
      {
        const codec = { ...JsonCodec };
        JsonCodec.encode = (args: IJsonArgs, output: thrift.TProtocol) => {
          const tson = isTson(args) ? args : marshal(args);
          codec.encode(tson, output);
        };
        JsonCodec.decode = (input: thrift.TProtocol): IJson => {
          return unmarshal(codec.decode(input));
        };
        ${Utils.indent(Utils.isTson.code(), 8).trimLeft()}
        ${Utils.indent(Utils.marshal.code(), 8).trimLeft()}
        ${Utils.indent(Utils.unmarshal.code(), 8).trimLeft()}
      }
    `);
  }

  private genClass(name: string, dbs: DatabaseMetadata[], apis: ApiMetadata[]): string {
    let script = `
      // tslint:disable:function-name
      import { ContentType, Context, ContextObject, CoreThriftHandler, Forbidden, gql, HttpRequest, HttpResponse, Metadata, Post, Public, RequestObject, Service } from 'tyx';
      import ${GEN} = require('./${name.toLowerCase()}');

      ///////// SERVICE /////////

      @Service(true)
      export class ${name}ThriftService {
        @Public()
        @Post('/thrift/{service}')
        @ContentType(HttpResponse)
        public async process(@RequestObject() req: HttpRequest, @ContextObject() ctx: Context): Promise<HttpResponse> {
          const service = req.pathParameters['service'];
          let result: any = undefined;
          switch (service) {\n`;
    for (const db of dbs) {
      const snake = Utils.snakeCase(db.name, true);
      script += `            case ${snake}: result = await ${snake}_HANDLER.execute(req, ctx); break;\n`;
    }
    for (const api of apis) {
      const snake = Utils.snakeCase(api.name, true);
      script += `            case ${snake}: result = await ${snake}_HANDLER.execute(req, ctx); break;\n`;
    }
    script += `            default: throw new Forbidden(\`Unknwon service [\${service}]\`);
          }
          return { statusCode: 200, body: result };
        }
      }

    `;
    return Utils.indent(script).trimLeft();
  }

  private genApi(metadata: ApiMetadata): Result {
    const kebab = Utils.kebapCase(metadata.name);
    const snake = Utils.snakeCase(metadata.name, true);
    const proxy = snake + '_PROXY';
    let thrift = `service ${metadata.name} {`;
    let query = `const ${snake} = '${kebab}';\n\n`;
    let handler = `const ${proxy}: ${GEN}.${metadata.name}.IHandler<Context> = {\n`;
    let count = 0;
    for (const method of Object.values(metadata.methods)) {
      if (!method.query && !method.mutation) continue;

      const result = method.result.build;
      let idlArgs = '';
      let jsArgs = '';
      let reqArgs = '';
      let qlArgs = '';
      let params = '';
      for (let i = 0; i < method.inputs.length; i++) {
        const inb = method.inputs[i].build;
        if (VarKind.isVoid(inb.kind) || VarKind.isResolver(inb.kind)) continue;
        const param = method.inputs[i].name;
        if (idlArgs) { idlArgs += ', '; jsArgs += ', '; reqArgs += ', '; qlArgs += ', '; params += ', '; }
        params += param;
        idlArgs += `${i + 1}: ${inb.idl} ${esc(param)}`;
        jsArgs += `${param}`; // `: ${VarKind.isScalar(inb.kind) ? '' : `${GEN}.`}${inb.js}`;
        reqArgs += `$${param}: ${inb.gql}!`;
        qlArgs += `${param}: $${param}`;
      }
      if (reqArgs) reqArgs = `(${reqArgs})`;
      if (qlArgs) qlArgs = `(${qlArgs})`;
      if (jsArgs) jsArgs += ', ';
      jsArgs += 'ctx?';

      if (count) thrift += ',';
      // if (method.mutation) {
      thrift += `\n  ${result.idl} ${esc(method.name)}(${idlArgs})`;
      // } else {
      //   script += `\n  ${result.idl} ${method.name}(${idlArgs}${idlArgs ? ', ' : ''}refresh: bool)`;
      // }

      const gql = Utils.snakeCase(metadata.name + '_' + method.name, true) + '_GQL';
      query += `const ${gql} = gql\`\n`;
      if (method.mutation) {
        query += `  mutation request${reqArgs} {\n`;
      } else {
        query += `  query request${reqArgs} {\n`;
      }
      query += `    result: ${method.api.name}_${method.name}${qlArgs} `;
      if (VarKind.isStruc(result.kind)) {
        const x = (VarKind.isType(result.kind)) ? 0 : 0;
        const select = TypeSelect.emit(result, method.select, 0, 1 + x);
        query += Utils.indent(select, '  '.repeat(2));
      } else if (VarKind.isArray(result.kind)) {
        const x = (VarKind.isType(result.item.kind)) ? 0 : 0;
        const select = TypeSelect.emit(result.item, method.select, 0, 1 + x);
        query += Utils.indent(select, '  '.repeat(2));
      } else {
        query += `# : ${result.kind}`;
      }
      if (qlArgs) query += `\n    # variables: { ${params} }`;
      query += `\n}\`;\n\n`;
      // if (method.query) {
      //   query += `,\n    // fetchPolicy: NO_CACHE ? 'no-cache' : refresh ? 'network-only' : 'cache-first'`;
      // }
      // query += `\n};\n\n`;

      handler += `${count ? ',\n' : ''}  async ${esc(method.name)}(${jsArgs}) {\n`;
      // `: Promise<${VarKind.isScalar(result.kind) ? '' : `${GEN}.`}${result.js}> {\n`;
      handler += `    const res = await ctx.execute(${gql}, { ${params} });\n`;
      handler += `    return res;\n`;
      handler += `  }`;

      count++;
    }
    thrift += '\n}';
    handler += '\n};\n';
    handler += Utils.indent(`
    const ${snake}_HANDLER = new CoreThriftHandler<${GEN}.${metadata.name}.Processor>({
      serviceName: ${snake},
      handler: new ${GEN}.${metadata.name}.Processor(${proxy}),
    });\n`);
    return { thrift, script: query + handler };
  }

  private genDatabase(metadata: DatabaseMetadata): Result {
    const db: DatabaseSchema = {
      metadata,
      name: metadata.name,
      alias: metadata.alias,
      entities: {},
      queries: {},
      mutations: {}
    };

    for (const entity of metadata.entities) this.genEntity(db, entity);

    let thrift = `# -- Database: ${metadata.name} --\n`;
    thrift += `service ${db.metadata.target.name} {\n`;
    for (const entity of Object.values(db.entities)) {
      thrift += `  // -- ${entity.name}\n`;
      entity.query.forEach(line => thrift += `  ` + line);
      entity.mutation.forEach(line => thrift += `  ` + line);
    }
    thrift += `} (kind="Database")\n`;
    for (const entity of Object.values(db.entities)) {
      thrift += `\n# -- Entity: ${entity.name} --\n`;
      thrift += entity.model;
      thrift += "\n";
    }
    for (const entity of Object.values(db.entities)) {
      thrift += `\n# -- Entity: ${entity.name} --\n`;
      thrift += entity.inputs.join('\n');
      thrift += "\n";
    }

    const snake = Utils.snakeCase(metadata.name, true);
    const kebab = Utils.kebapCase(metadata.name);

    let script = `const ${snake} = '${kebab}';\n`;
    script += `const ${snake}_PROXY: ${GEN}.${metadata.name}.IHandler<any> = {\n`;
    for (let [name, body] of Object.entries(db.queries)) {
      body = Utils.indent(body, '  ').trimLeft();
      script += `  ${name}${body},\n`;
    }
    for (let [name, body] of Object.entries(db.mutations)) {
      body = Utils.indent(body, '  ').trimLeft();
      script += `  ${name}${body},\n`;
    }

    script += '};\n';

    script += Utils.indent(`
    const ${snake}_HANDLER = new CoreThriftHandler<${GEN}.${metadata.name}.Processor>({
      serviceName: ${snake},
      handler: new ${GEN}.${metadata.name}.Processor(${snake}_PROXY),
    });`);

    return { thrift, script };
  }

  private genEntity(db: DatabaseSchema, entity: EntityMetadata): EntitySchema {
    const name = entity.name;
    if (db.entities[name]) return db.entities[name];

    let model = `struct ${name}${ENTITY} {`;
    let partial = `PartialExpr {`;
    let nil = `NullExpr {`;
    let multi = `MultiExpr {`;
    let like = `LikeExpr {`;
    let order = `OrderExpr {`;
    let create = `CreateRecord {`;
    let update = `UpdateRecord {`;
    let keys = '';
    let keyJs = '';
    let keyNames = '';
    let keyIx = 0;
    let index = 0;
    let cm = true;
    for (const col of entity.columns) {
      if (col.isTransient) continue;
      index++;
      const pn = col.propertyName;
      let dt = col.build.idl;
      let nl = col.mandatory ? 'required' : 'optional';
      if (pn.endsWith('Id')) dt = VarKind.ID;
      model += `${cm ? '' : ','}\n  ${index}: ${nl} ${dt} ${pn}`;
      if (col.isPrimary) {
        keys += `${cm ? '' : ', '}${++keyIx}: ${nl} ${dt} ${pn}`;
        keyJs += `${cm ? '' : ', '}${pn}: ${col.build.js}`;
        keyNames += `${cm ? '' : ', '}${pn}`;
      }
      partial += `${cm ? '' : ','}\n  ${index}: optional ${dt} ${pn}`;
      nil += `${cm ? '' : ','}\n  ${index}: optional bool ${pn}`;
      multi += `${cm ? '' : ','}\n  ${index}: optional list<${dt}> ${pn}`;
      like += `${cm ? '' : ','}\n  ${index}: optional string ${pn}`;
      order += `${cm ? '' : ','}\n  ${index}: optional i16 ${pn}`;
      update += `${cm ? '' : ','}\n  ${index}: ${col.isPrimary ? 'required' : 'optional'} ${dt} ${pn}`;
      if (col.isCreateDate || col.isUpdateDate || col.isVersion || col.isVirtual || col.isGenerated) nl = 'optional';
      create += `${cm ? '' : ','}\n  ${index}: ${nl} ${dt} ${pn}`;
      cm = false;
    }
    // Debug field
    // model += `,\n  _exclude: Boolean`;
    // model += `,\n  _debug: _DebugInfo`;
    let qix = 0;
    const opers = [
      `${++qix}: optional ${ARGS}${name}PartialExpr if`,
      `${++qix}: optional ${ARGS}${name}PartialExpr eq`,
      `${++qix}: optional ${ARGS}${name}PartialExpr ne`,
      `${++qix}: optional ${ARGS}${name}PartialExpr gt`,
      `${++qix}: optional ${ARGS}${name}PartialExpr gte`,
      `${++qix}: optional ${ARGS}${name}PartialExpr lt`,
      `${++qix}: optional ${ARGS}${name}PartialExpr lte`,
      `${++qix}: optional ${ARGS}${name}LikeExpr like`,
      `${++qix}: optional ${ARGS}${name}LikeExpr nlike`,
      `${++qix}: optional ${ARGS}${name}LikeExpr rlike`,
      `${++qix}: optional ${ARGS}${name}MultiExpr in`,
      `${++qix}: optional ${ARGS}${name}MultiExpr nin`,
      `${++qix}: optional ${ARGS}${name}NullExpr nil`, // TODO
      `${++qix}: optional ${ARGS}${name}WhereExpr not`,
      `${++qix}: optional ${ARGS}${name}WhereExpr nor`,
      `${++qix}: optional list<${ARGS}${name}WhereExpr> and`,
      `${++qix}: optional list<${ARGS}${name}WhereExpr> or`,
    ];

    const where = `WhereExpr {\n  `
      + opers.join(',\n  ');

    const queryExpr = 'QueryExpr {'
      + `\n  `
      + opers.join(',\n  ') + `,`
      + `\n  ${++qix}: optional ${ARGS}${name}OrderExpr order,`
      + `\n  ${++qix}: optional i32 skip,`
      + `\n  ${++qix}: optional i32 take,`
      + `\n  ${++qix}: optional bool exists`;

    const temp = [queryExpr, where, partial, nil, multi, like, order];
    if (this.crud) {
      temp.push(create);
      temp.push(update);
    }
    const inputs = temp.map(x => `struct ${ARGS}${name}${x}\n} (kind = "Expression")\n`);

    const queryInput = `1: optional ${ARGS}${name}QueryExpr query`;
    const query = [
      `${name}${ENTITY} ${GET}${name}(${keys}); // @crud(auth: {})\n`,
      `list<${name}${ENTITY}> ${SEARCH}${name}(${queryInput});  // @crud(auth: {})\n`
    ];

    const mutation = [
      `${name}${ENTITY} ${CREATE}${name}(1: required ${ARGS}${name}CreateRecord record); // @crud(auth: {}),\n`,
      `${name}${ENTITY} ${UPDATE}${name}(1: required ${ARGS}${name}UpdateRecord record); // @crud(auth: {}),\n`,
      `${name}${ENTITY} ${REMOVE}${name}(${keys}); // @crud(auth: {})\n`,
    ];

    const schema: EntitySchema = {
      metadata: entity,
      name: entity.name,

      query,
      mutation: this.crud ? mutation : undefined,
      model,
      inputs,
      // search,
      // simple: model
      // relations: {},
    };
    db.queries = {
      ...db.queries,
      [`${GET}${name}`]: `
      (${keyJs}, ctx?: Context): Promise<${GEN}.${entity.name}> {
        return ctx.provider.get(Metadata.Entity['${entity.name}'], null, { ${keyNames} }, ctx);
      }`,
      [`${SEARCH}${name}`]: `
      (query: ${GEN}.${ARGS}${name}QueryExpr, ctx?: Context): Promise<${GEN}.${entity.name}[]> {
        return ctx.provider.search(Metadata.Entity['${entity.name}'], null, { query }, ctx);
      }`,
    };
    db.mutations = this.crud ? {
      ...db.mutations,
      [`${CREATE}${name}`]: `
      (record: ${GEN}.${ARGS}${name}CreateRecord, ctx?: Context): Promise<${GEN}.${name}${ENTITY}> {
        return ctx.provider.create(Metadata.Entity['${entity.name}'], null, record, ctx);
      }`,
      [`${UPDATE}${name}`]: `
      (record: ${GEN}.${ARGS}${name}UpdateRecord, ctx?: Context): Promise<${GEN}.${name}${ENTITY}> {
        return ctx.provider.update(Metadata.Entity['${entity.name}'], null, record, ctx);
      }`,
      [`${REMOVE}${name}`]: `
      (${keyJs}, ctx?: Context): Promise<${GEN}.${name}${ENTITY}> {
        return ctx.provider.remove(Metadata.Entity['${entity.name}'], null, { ${keyNames} }, ctx);
      }`,
    } : db.mutations;
    db.entities[name] = schema;

    // let simple = model;
    // const navigation: Record<string, Resolver> = {};
    for (const relation of entity.relations) {
      const property = relation.propertyName;
      const inverse = relation.inverseEntityMetadata.name;
      const rm = /* schema.relations[property] = */ { inverse } as any;
      // TODO: Subset of entities
      // if (!entities.find(e => e.name === target)) continue;
      if (relation.relationType === RelationType.ManyToOne) {
        rm.type = 'manyToOne';
        const args = '';
        model += `,\n  ${++index}: optional ${inverse}${ENTITY} ${property}${args} (relation = "ManyToOne")`;
        // simple += `,\n  ${property}: ${inverse}${ENTITY}`;
        // navigation[property] = (obj, args, ctx, info) => ctx.provider.manyToOne(metadata, relation, obj, args, ctx, info);
      } else if (relation.relationType === RelationType.OneToOne) {
        rm.type = 'oneToOne';
        const args = '';
        model += `,\n  ${++index}: optional ${inverse}${ENTITY} ${property}${args} (relation = "OneToOne")`;
        // navigation[property] = (obj, args, ctx, info) => ctx.provider.oneToOne(metadata, relation, obj, args, ctx, info);
      } else if (relation.relationType === RelationType.OneToMany) {
        rm.type = 'oneToMany';
        // const temp = this.genEntity(db, relation.inverseEntityMetadata);
        const args = ''; // ` (${temp.search}\n  )`;
        model += `,\n  ${++index}: optional list<${inverse}${ENTITY}> ${property}${args} (relation = "OneToMany")`;
        // navigation[property] = (obj, args, ctx, info) => ctx.provider.oneToMany(metadata, relation, obj, args, ctx, info);
      } else if (relation.relationType === RelationType.ManyToMany) {
        rm.type = 'manyToMany';
        // const temp = this.genEntity(db, relation.inverseEntityMetadata);
        const args = ''; //  ` (${temp.search}\n  )`;
        model += `,\n  ${++index}: optional list<${inverse}${ENTITY}> ${property}${args} (relation = "ManyToMany")`;
        // navigation[property] = (obj, args, ctx, info) => ctx.provider.manyToMany(metadata, relation, obj, args, ctx, info);
      }
    }
    for (const col of entity.columns) {
      if (!col.isTransient) continue;
      const pn = col.propertyName;
      // const nl = col.required ? '!' : '';
      model += `${cm ? '' : ','}\n  ${++index}: optional ${col.build.idl} ${pn} (transient)`;
    }
    model += `\n} (kind="Entity")`;
    // simple += '\n}';

    schema.model = model;
    // schema.simple = simple;
    // schema.resolvers = navigation;
    // schema.schema = query + "\n" + mutation + "\n" + model + "\n" + inputs.join("\n");

    return schema;
  }
}
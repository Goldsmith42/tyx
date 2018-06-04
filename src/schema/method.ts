import * as Lo from "lodash";
import { Bool, Int, List, Metadata, Obj, Ref, Str } from "../decorators/type";
import { ResolverArgs } from "../graphql/types";
import { DesignMetadata, EventRouteMetadata, HttpAdapter, HttpBinder, HttpBindingMetadata, HttpBindingType, HttpRouteMetadata, IMethodMetadata } from "../metadata/method";
import { GraphMetadata } from "../metadata/type";
import { Class } from "../types/core";
import { EventAdapter } from "../types/event";
import { HttpCode } from "../types/http";
import { Roles } from "../types/security";
import { GraphMetadataSchema } from "./type";

@Metadata()
export class HttpBindingMetadataSchema implements HttpBindingMetadata {
    @Str() type: HttpBindingType;
    @Str() path: string;
    @Str() binder: HttpBinder;

    public static binder(obj: HttpBindingMetadata): string {
        return obj.binder && `[function: ${obj.binder.toString()}]`;
    }
}

@Metadata()
export class HttpRouteMetadataSchema implements HttpRouteMetadata {
    @Str() target: Class;
    @Str() routeId: string;
    @Str() serviceId: string;
    @Str() methodId: string;
    @Str() verb: string;
    @Str() resource: string;
    @Str() model: string;
    @Int() code: HttpCode;
    @Str() adapter: HttpAdapter;
    // Relations
    // api: ApiMetadata;
    // method: MethodMetadata;

    public static target(obj: HttpRouteMetadata, args: ResolverArgs): string {
        return obj.target && `[class: ${obj.target.name}]`;
    }

    public static adapter(obj: HttpRouteMetadata): string {
        return obj.adapter && `[function: ${obj.adapter.toString()}]`;
    }
}

@Metadata()
export class EventRouteMetadataSchema implements EventRouteMetadata {
    @Str() target: Class;
    @Str() eventId: string;
    @Str() serviceId: string;
    @Str() methodId: string;
    @Str() source: string;
    @Str() resource: string;
    @Str() objectFilter: string;
    @Str() actionFilter: string;
    @Str() adapter: EventAdapter;

    public static target(obj: EventRouteMetadata, args: ResolverArgs): string {
        return obj.target && `[class: ${obj.target.name}]`;
    }

    public static adapter(obj: EventRouteMetadata): string {
        return obj.adapter && `[function: ${obj.adapter.toString()}]`;
    }
}

@Metadata()
export class MethodMetadataSchema implements IMethodMetadata {
    @Str() target: Class;
    @Str() methodId: string;
    @Str() serviceId: string;
    @Obj() design: DesignMetadata[];

    @Str() auth: string;
    @Obj() roles: Roles;

    @Bool() query: boolean;
    @Bool() mutation: boolean;
    @Ref(type => GraphMetadataSchema) input: GraphMetadata;
    @Ref(type => GraphMetadataSchema) result: GraphMetadata;

    @Str() contentType: string;
    @List(type => HttpBindingMetadataSchema) bindings: HttpBindingMetadata[];
    @List(type => HttpRouteMetadataSchema) http: Record<string, HttpRouteMetadata>;
    @List(type => EventRouteMetadataSchema) events: Record<string, EventRouteMetadata>;

    public static target(obj: IMethodMetadata, args: ResolverArgs): string {
        return obj.target && `[class: ${obj.target.name}]`;
    }

    public static http(obj: IMethodMetadata, args: ResolverArgs): HttpRouteMetadata[] {
        return Lo.filter(Object.values(obj.http), args);
    }

    public static events(obj: IMethodMetadata, args: ResolverArgs): EventRouteMetadata[] {
        return Lo.filter(Object.values(obj.events), args);
    }
}
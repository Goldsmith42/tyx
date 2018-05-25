import { Roles } from "../types";
import { ApiMetadata } from "./api";
import { AuthMetadata } from "./auth";
import { TypeMetadata, GraphType } from "./type";

export function Query<TR extends Roles>(roles?: TR, input?: Function, result?: Function) {
    return ResolverDecorator(Query.name, roles, input, result);
}

export function Mutation<TR extends Roles>(roles?: TR, input?: Function, result?: Function) {
    return ResolverDecorator(Mutation.name, roles, input, result);
}

export function Advice<TR extends Roles>(roles?: TR, input?: Function, result?: Function) {
    return ResolverDecorator(Advice.name, roles, input, result);
}

export function Command<TR extends Roles>(roles?: TR, input?: Function, result?: Function) {
    return ResolverDecorator(Command.name, roles, input, result);
}

function ResolverDecorator(oper: string, roles: Roles, input?: Function, result?: Function): MethodDecorator {
    oper = oper.toLowerCase();
    return (target, propertyKey, descriptor) => {
        if (typeof propertyKey !== "string") throw new TypeError("propertyKey must be string");
        ResolverMetadata.define(target, propertyKey, descriptor, oper, roles, input, result);
    };
}

export interface ResolverMetadata extends AuthMetadata {
    input: TypeMetadata;
    result: TypeMetadata;
}

export namespace ResolverMetadata {
    export function has(target: Object, propertyKey: string): boolean {
        return !!get(target, propertyKey);
    }

    export function get(target: Object, propertyKey: string): ResolverMetadata {
        let meta = AuthMetadata.get(target, propertyKey) as ResolverMetadata;
        return meta && meta.roles && meta.input && meta.result && meta;
    }

    export function define(target: Object, propertyKey: string, descriptor: PropertyDescriptor,
        oper: string, roles: Roles, input?: Function, result?: Function): ResolverMetadata {
        let meta = AuthMetadata.define(target, propertyKey, descriptor, oper, roles) as ResolverMetadata;
        meta.input = input ? { type: GraphType.Ref, target: input } : { type: GraphType.ANY };
        meta.result = result ? { type: GraphType.Ref, target: result } : { type: GraphType.ANY };
        let api = ApiMetadata.init(target.constructor);
        api.resolverMetadata[propertyKey] = meta;
        return meta;
    }
}
import { Config } from "./config";
import { QueryBuilder } from "./query-builder";
import { BelongsTo } from "./relations/belongs-to";
import { HasMany } from "./relations/has-many";
import { HasOne } from "./relations/has-one";
import { lowercaseFirstLetter, modelToForeignKeyId } from "./string";

interface Constructor<T> {
  new (...args: any): T;
}

export class Model {
  static connection = "default";
  static table = "";
  id?: number;
  updatedAt?: Date;
  createdAt?: Date;

  public timestamps = true;

  constructor(public attributes: any = {}) {
    this.attributes = attributes;
    Object.keys(attributes).forEach((key) => {
      this[key as keyof Model] = attributes[key];
    });

    return new Proxy(this, {
      get(target, prop) {
        if (prop in target) {
          return target[prop as keyof Model];
        }

        if (prop in target.attributes) {
          return target.attributes[prop];
        }

        // If trying to access a relation property, and it hasn't be set yet, call the relation function.
        if (typeof prop === "string" && target[`$${prop}` as keyof Model]) {
          return target[`$${prop}` as keyof Model]();
        }

        return undefined;
      },

      set(target, prop, value) {
        target[prop as keyof Model] = value;
        target.attributes[prop] = value;
        return true;
      },
    });
  }

  static instanceFromDB(dbAttributes: any) {
    let attributes = {} as Record<string, any>;
    const propertiesWeKnowAreDates = ["createdAt", "updatedAt"];

    Object.keys(dbAttributes).forEach((key) => {
      // TODO: Support other explicit casts.
      if (propertiesWeKnowAreDates.includes(key)) {
        attributes[key] = new Date(dbAttributes[key]);
      } else {
        attributes[key] = dbAttributes[key];
      }
    });

    return new this(attributes);
  }

  static getConnection(): D1Database {
    if (!Config.database) {
      throw new Error("No database connection defined");
    }

    if (!Config.database?.connections?.[this.connection]) {
      throw new Error(`No database connection defined for ${this.connection}`);
    }

    return Config.database?.connections?.[this.connection];
  }

  static query() {
    return new QueryBuilder(new this());
  }

  static all() {
    return this.query().select("*").all();
  }

  static first() {
    return this.query().first();
  }

  static find(id: number) {
    return this.query().where("id", id).first();
  }

  static orderBy(field: string, direction: "asc" | "desc" = "asc") {
    return this.query().orderBy(field, direction);
  }

  static count(): Promise<number> {
    return this.query().count();
  }

  static where(field: string, value: string | number): any;
  static where(field: string, operator: string, value?: string | number): any;
  static where(field: string, operator: string, value?: string | number) {
    return this.query().where(field, operator, value);
  }

  /**
   * Create a model with the attributes, and return an instance of the model.
   */
  static async create(attributes: any) {
    const model = new this(attributes);
    await model.save();
    return model;
  }

  private async performInsert() {
    const query = new QueryBuilder(this);

    if (this.timestamps) {
      this.updateTimestamps();
    }

    const results = await query.insert(this.serializeAttributes());
    this.id = results.id;
    return true;
  }

  private async performUpdate() {
    const query = new QueryBuilder(this);

    if (this.timestamps) {
      this.updateTimestamps();
    }

    await query.update(this.serializeAttributes());
    return true;
  }

  async save() {
    return this.id ? await this.performUpdate() : await this.performInsert();
  }

  protected serializeAttributes() {
    return Object.keys(this.attributes).reduce((acc, key) => {
      let value = this.attributes[key];

      switch (typeof value) {
        case "object":
          value =
            value instanceof Date ? value.getTime() : JSON.stringify(value);
          break;

        case "boolean":
          value = value ? 1 : 0;
          break;

        case "undefined":
          value = null;
          break;

        default:
          break;
      }

      acc[key] = value;
      return acc;
    }, {} as Record<string, any>);
  }

  serialize() {
    return {
      ...this.serializeAttributes(),
    };
  }

  toJSON() {
    return this.serialize();
  }

  /**
   * Timestamps
   */

  updateTimestamps() {
    const now = new Date();

    // TODO: Only update if the value is not dirty.
    this.updatedAt = now;

    if (!this.createdAt) {
      this.createdAt = now;
    }

    return this;
  }

  /**
   * Relationships
   */

  belongsTo(model: any, foreignKey?: string, ownerKey?: string) {
    foreignKey = foreignKey || modelToForeignKeyId(model.name);
    ownerKey = ownerKey || "id";

    /**
     * We assume the relation name is the lowercase version of the model name.
     * This might be a bad assumption, but it's a start.
     */
    const relationName = lowercaseFirstLetter(model.name);

    return new BelongsTo(
      model.query(),
      this,
      foreignKey,
      ownerKey,
      relationName
    );
  }

  hasOne(model: any, foreignKey?: string, ownerKey?: string) {
    foreignKey = foreignKey || modelToForeignKeyId(this.constructor.name);
    ownerKey = ownerKey || "id";

    /**
     * We assume the relation name is the lowercase version of the model name.
     * This might be a bad assumption, but it's a start.
     */
    const relationName = lowercaseFirstLetter(model.name);

    return new HasOne(model.query(), this, foreignKey, ownerKey, relationName);
  }

  hasMany(model: any, foreignKey?: string, ownerKey?: string) {
    foreignKey = foreignKey || modelToForeignKeyId(this.constructor.name);
    ownerKey = ownerKey || "id";

    /**
     * We assume the relation name is the lowercase version of the model name.
     * This might be a bad assumption, but it's a start.
     */
    const relationName = lowercaseFirstLetter(model.name);

    return new HasMany(model.query(), this, foreignKey, ownerKey, relationName);
  }
}

export interface ModelConstructor<M extends Model> extends Constructor<M> {}

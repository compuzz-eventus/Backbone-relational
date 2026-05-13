import _ from 'underscore';
import $ from 'jquery';
import Backbone from 'backbone';
import Relational from '../../backbone-relational.js';

// Bootstrap globals once. Multiple imports of this file are no-ops because
// ESM caches the module evaluation; the assignments below are also idempotent
// thanks to module caching of underscore/jquery/backbone.
window._ = _;
window.$ = $;
window.Backbone = Backbone;
Backbone.Relational = Relational;

/**
 * Zoo
 */

window.Zoo = Backbone.Relational.Model.extend({
	urlRoot: '/zoo/',

	relations: [
		{
			type: Backbone.Relational.HasMany,
			key: 'animals',
			relatedModel: 'Animal',
			includeInJSON: ['id', 'species'],
			collectionType: 'AnimalCollection',
			reverseRelation: {
				key: 'livesIn',
				includeInJSON: ['id', 'name']
			}
		},
		{
			type: Backbone.Relational.HasMany,
			key: 'visitors',
			relatedModel: 'Visitor'
		}
	],

	toString: function () {
		return 'Zoo (' + this.id + ')';
	}
});

window.Animal = Backbone.Relational.Model.extend({
	urlRoot: '/animal/',

	relations: [
		{
			type: Backbone.Relational.HasOne,
			key: 'favoriteFood',
			relatedModel: 'Food'
		}
	],

	// For validation testing. Wikipedia says elephants are reported up to 12.000 kg.
	validate: function (attrs) {
		if (attrs.species === 'elephant' && attrs.weight && attrs.weight > 12000) {
			return 'Too heavy.';
		}
	},

	toString: function () {
		return 'Animal (' + this.id + ')';
	}
});

window.AnimalCollection = Backbone.Relational.Collection.extend({
	model: window.Animal
});

window.Food = Backbone.Relational.Model.extend({
	urlRoot: '/food/'
});

window.Visitor = Backbone.Relational.Model.extend();

/**
 * House/Person/Job/Company
 */

window.House = Backbone.Relational.Model.extend({
	relations: [
		{
			type: Backbone.Relational.HasMany,
			key: 'occupants',
			relatedModel: 'Person',
			reverseRelation: {
				key: 'livesIn',
				includeInJSON: false
			}
		}
	],

	toString: function () {
		return 'House (' + this.id + ')';
	}
});

window.User = Backbone.Relational.Model.extend({
	urlRoot: '/user/',

	toString: function () {
		return 'User (' + this.id + ')';
	}
});

window.Person = Backbone.Relational.Model.extend({
	relations: [
		{
			// Create a cozy, recursive, one-to-one relationship
			type: Backbone.Relational.HasOne,
			key: 'likesALot',
			relatedModel: 'Person',
			reverseRelation: {
				type: Backbone.Relational.HasOne,
				key: 'likedALotBy'
			}
		},
		{
			type: Backbone.Relational.HasOne,
			key: 'user',
			keyDestination: 'user_id',
			relatedModel: 'User',
			includeInJSON: Backbone.Model.prototype.idAttribute,
			reverseRelation: {
				type: Backbone.Relational.HasOne,
				includeInJSON: 'name',
				key: 'person'
			}
		},
		{
			type: 'HasMany',
			key: 'jobs',
			relatedModel: 'Job',
			reverseRelation: {
				key: 'person'
			}
		}
	],

	toString: function () {
		return 'Person (' + this.id + ')';
	}
});

window.PersonCollection = Backbone.Relational.Collection.extend({
	model: window.Person
});

window.Password = Backbone.Relational.Model.extend({
	relations: [
		{
			type: Backbone.Relational.HasOne,
			key: 'user',
			relatedModel: 'User',
			reverseRelation: {
				type: Backbone.Relational.HasOne,
				key: 'password'
			}
		}
	],

	toString: function () {
		return 'Password (' + this.id + ')';
	}
});

// A link table between 'Person' and 'Company' for many-to-many.
window.Job = Backbone.Relational.Model.extend({
	defaults: {
		startDate: null,
		endDate: null
	},

	toString: function () {
		return 'Job (' + this.id + ')';
	}
});

window.Company = Backbone.Relational.Model.extend({
	relations: [
		{
			type: 'HasMany',
			key: 'employees',
			relatedModel: 'Job',
			reverseRelation: {
				key: 'company'
			}
		},
		{
			type: 'HasOne',
			key: 'ceo',
			relatedModel: 'Person',
			reverseRelation: {
				key: 'runs'
			}
		}
	],

	toString: function () {
		return 'Company (' + this.id + ')';
	}
});

/**
 * Node/NodeList
 */
window.Node = Backbone.Relational.Model.extend({
	urlRoot: '/node/',

	relations: [
		{
			type: Backbone.Relational.HasOne,
			key: 'parent',
			reverseRelation: {
				key: 'children'
			}
		}
	],

	toString: function () {
		return 'Node (' + this.id + ')';
	}
});

window.NodeList = Backbone.Relational.Collection.extend({
	model: window.Node
});

/**
 * Customer/Address/Shop/Agent
 */

window.Customer = Backbone.Relational.Model.extend({
	urlRoot: '/customer/',

	toString: function () {
		return 'Customer (' + this.id + ')';
	}
});

window.CustomerCollection = Backbone.Relational.Collection.extend({
	model: window.Customer,

	initialize: function (models, options) {
		options || (options = {});
		this.url = options.url;
	}
});

window.Address = Backbone.Relational.Model.extend({
	urlRoot: '/address/',

	toString: function () {
		return 'Address (' + this.id + ')';
	}
});

window.Shop = Backbone.Relational.Model.extend({
	relations: [
		{
			type: Backbone.Relational.HasMany,
			key: 'customers',
			collectionType: 'CustomerCollection',
			collectionOptions: function (instance) {
				return { url: 'shop/' + instance.id + '/customers/' };
			},
			relatedModel: 'Customer',
			autoFetch: true
		},
		{
			type: Backbone.Relational.HasOne,
			key: 'address',
			relatedModel: 'Address',
			autoFetch: {
				success: function (model, response) {
					response.successOK = true;
				},
				error: function (model, response) {
					response.errorOK = true;
				}
			}
		}
	],

	toString: function () {
		return 'Shop (' + this.id + ')';
	}
});

window.Agent = Backbone.Relational.Model.extend({
	urlRoot: '/agent/',

	relations: [
		{
			type: Backbone.Relational.HasMany,
			key: 'customers',
			relatedModel: 'Customer',
			includeInJSON: Backbone.Relational.Model.prototype.idAttribute
		},
		{
			type: Backbone.Relational.HasOne,
			key: 'address',
			relatedModel: 'Address',
			autoFetch: false
		}
	],

	toString: function () {
		return 'Agent (' + this.id + ')';
	}
});

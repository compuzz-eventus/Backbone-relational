import { describe, it, beforeEach, expect } from 'vitest';
import { reset } from './setup/setup.js';

describe('Events', () => {
	beforeEach(reset);

	it('`add:`, `remove:` and `change:` events', () => {
		const zoo = new Zoo();
		const animal = new Animal();

		let addAnimalEventsTriggered = 0;
		let removeAnimalEventsTriggered = 0;
		let changeEventsTriggered = 0;
		let changeLiveInEventsTriggered = 0;

		zoo.on('add:animals', () => {
			addAnimalEventsTriggered++;
		}).on('remove:animals', () => {
			removeAnimalEventsTriggered++;
		});

		animal
			.on('change', () => {
				changeEventsTriggered++;
			})
			.on('change:livesIn', () => {
				changeLiveInEventsTriggered++;
			});

		addAnimalEventsTriggered = 0;
		removeAnimalEventsTriggered = 0;
		changeEventsTriggered = 0;
		changeLiveInEventsTriggered = 0;

		animal.trigger('change');
		expect(changeEventsTriggered).toBe(1);
		expect(changeLiveInEventsTriggered).toBe(0);

		addAnimalEventsTriggered = 0;
		removeAnimalEventsTriggered = 0;
		changeEventsTriggered = 0;
		changeLiveInEventsTriggered = 0;

		animal.set('livesIn', zoo);
		zoo.set('id', 'z1');
		animal.set('id', 'a1');

		expect(addAnimalEventsTriggered).toBe(1);
		expect(removeAnimalEventsTriggered).toBe(0);
		expect(changeEventsTriggered).toBe(2);
		expect(changeLiveInEventsTriggered).toBe(1);

		zoo.set('animals', ['a1']);

		expect(addAnimalEventsTriggered).toBe(1);
		expect(removeAnimalEventsTriggered).toBe(0);
		expect(changeEventsTriggered).toBe(2);
		expect(changeLiveInEventsTriggered).toBe(1);

		animal.set('livesIn', 'z1');

		expect(addAnimalEventsTriggered).toBe(1);
		expect(removeAnimalEventsTriggered).toBe(0);
		expect(changeEventsTriggered).toBe(2);
		expect(changeLiveInEventsTriggered).toBe(1);

		animal.set('livesIn', { id: 'z2' });

		expect(addAnimalEventsTriggered).toBe(1);
		expect(removeAnimalEventsTriggered).toBe(1);
		expect(changeEventsTriggered).toBe(3);
		expect(changeLiveInEventsTriggered).toBe(2);
	});

	it('`reset` events', () => {
		const initialize = AnimalCollection.prototype.initialize;
		let resetEvents = 0;
		let addEvents = 0;
		let removeEvents = 0;
		let updateEvents = 0;

		AnimalCollection.prototype.initialize = function () {
			this.on('add', () => {
				addEvents++;
			})
				.on('reset', () => {
					resetEvents++;
				})
				.on('remove', () => {
					removeEvents++;
				})
				.on('update', () => {
					updateEvents++;
				});
		};

		const zoo = new Zoo();

		expect(zoo.get('animals')).toBeInstanceOf(AnimalCollection);
		expect(resetEvents).toBe(0);
		expect(addEvents).toBe(0);
		expect(removeEvents).toBe(0);
		expect(updateEvents).toBe(0);

		zoo.set('animals', { id: 1 });

		expect(addEvents).toBe(1);
		expect(zoo.get('animals').length).toBe(1);

		zoo.get('animals').at(0).set({ foo: 'bar' });
		expect(updateEvents).toBe(1);

		zoo.get('animals').reset();

		expect(resetEvents).toBe(1);
		expect(zoo.get('animals').length).toBe(0);

		AnimalCollection.prototype.initialize = initialize;
	});

	it('Firing of `change` and `change:<key>` events', () => {
		const data = {
			id: 1,
			animals: []
		};

		const zoo = new Zoo(data);

		let change = 0;
		zoo.on('change', () => {
			change++;
		});

		let changeAnimals = 0;
		zoo.on('change:animals', () => {
			changeAnimals++;
		});

		let animalChange = 0;
		zoo.get('animals').on('change', () => {
			animalChange++;
		});

		zoo.set(data);

		expect(change).toBe(0);
		expect(changeAnimals).toBe(0);
		expect(animalChange).toBe(0);

		change = changeAnimals = animalChange = 0;
		zoo.set({ animals: [{ id: 'a1' }] });

		expect(change).toBe(1);
		expect(changeAnimals).toBe(1);
		expect(animalChange).toBe(1);

		change = changeAnimals = animalChange = 0;
		zoo.set({ animals: [{ id: 'a1', name: 'a1' }] });

		expect(change).toBe(0);
		expect(changeAnimals).toBe(0);
		expect(animalChange).toBe(1);

		change = changeAnimals = animalChange = 0;
		zoo.set({ name: 'Artis' });

		expect(change).toBe(1);
		expect(changeAnimals).toBe(0);
		expect(animalChange).toBe(0);

		change = changeAnimals = animalChange = 0;
		zoo.set({ animals: [{ id: 'a2' }] });

		expect(change).toBe(1);
		expect(changeAnimals).toBe(1);
		expect(animalChange).toBe(1);

		change = changeAnimals = animalChange = 0;
		zoo.set({ animals: [] });

		expect(change).toBe(1);
		expect(changeAnimals).toBe(1);
		expect(animalChange).toBe(0);

		const animals = zoo.get('animals');
		const a1 = Animal.findOrCreate('a1', { create: false });
		const a2 = Animal.findOrCreate('a2', { create: false });

		expect(a1).toBeInstanceOf(Animal);
		expect(a2).toBeInstanceOf(Animal);

		change = changeAnimals = animalChange = 0;
		animals.add('a2');

		expect(change).toBe(0);
		expect(changeAnimals).toBe(0);
		expect(animalChange).toBe(0);

		change = changeAnimals = animalChange = 0;
		a2.set('name', 'a2');

		expect(change).toBe(0);
		expect(changeAnimals).toBe(0);
		expect(animalChange).toBe(1);

		change = changeAnimals = animalChange = 0;
		animals.remove('a2');

		expect(change).toBe(0);
		expect(changeAnimals).toBe(0);
		expect(animalChange).toBe(0);
	});

	it('Does not trigger add / remove events for existing models on bulk assignment', () => {
		const house = new House({
			id: 'house-100',
			location: 'in the middle of the street',
			occupants: [{ id: 'person-5', jobs: [{ id: 'job-22' }] }, { id: 'person-6' }]
		});

		let eventsTriggered = 0;

		house
			.on('add:occupants', () => {
				eventsTriggered++;
			})
			.on('remove:occupants', () => {
				eventsTriggered++;
			});

		house
			.get('occupants')
			.at(0)
			.on('add:jobs', () => {
				eventsTriggered++;
			});

		house.set(house.toJSON());

		expect(eventsTriggered).toBe(0);
	});

	it('triggers appropriate add / remove / change events on bulk assignment', () => {
		const house = new House({
			id: 'house-100',
			location: 'in the middle of the street',
			occupants: [{ id: 'person-5', nickname: 'Jane' }, { id: 'person-6' }, { id: 'person-8', nickname: 'Jon' }]
		});

		let addEventsTriggered = 0;
		let removeEventsTriggered = 0;
		let changeEventsTriggered = 0;

		house
			.on('add:occupants', (model) => {
				expect(model.id).toBe('person-7');
				addEventsTriggered++;
			})
			.on('remove:occupants', (model) => {
				expect(model.id).toBe('person-6');
				removeEventsTriggered++;
			});

		house.get('occupants').on('change:nickname', (model) => {
			expect(model.id).toBe('person-8');
			changeEventsTriggered++;
		});

		house.set({
			occupants: [{ id: 'person-5', nickname: 'Jane' }, { id: 'person-7' }, { id: 'person-8', nickname: 'Phil' }]
		});

		expect(addEventsTriggered).toBe(1);
		expect(removeEventsTriggered).toBe(1);
		expect(changeEventsTriggered).toBe(1);
	});

	it('triggers appropriate change events even when callbacks have triggered set with an unchanging value', () => {
		const house = new House({
			id: 'house-100',
			location: 'in the middle of the street'
		});

		let changeEventsTriggered = 0;

		house
			.on('change:location', () => {
				house.set({ location: 'somewhere else' });
			})
			.on('change', () => {
				changeEventsTriggered++;
			});

		house.set({ location: 'somewhere else' });

		expect(changeEventsTriggered).toBe(1);

		const person = new Person({
			id: 1
		});

		changeEventsTriggered = 0;

		person
			.on('change:livesIn', () => {
				house.set({ livesIn: house });
			})
			.on('change', () => {
				changeEventsTriggered++;
			});

		person.set({ livesIn: house });

		expect(changeEventsTriggered).toBe(2);
	});

	it("Custom 'change'-prefixed events don't pollute _attributeChangeFired", () => {
		// Before the trigger-filter fix, `eventName.length > 5 && indexOf('change') === 0`
		// matched things like 'changeset' / 'changes' too. While the eventQueue was locked,
		// those got queued and the handler set `_attributeChangeFired = true` (via the
		// "no relation, changed" branch), causing the next queued `change` to fire even
		// when nothing had actually changed.
		const animal = new Animal({ id: 'cs-1' });

		let changeFired = 0;
		animal.on('change', () => {
			changeFired++;
		});

		Backbone.Relational.eventQueue.block();
		try {
			animal.trigger('changeset');
			animal.trigger('change');
		} finally {
			Backbone.Relational.eventQueue.unblock();
		}

		expect(changeFired).toBe(0);
	});
});

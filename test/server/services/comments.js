const CommentModel = require('../../../models/comment');
const ActionModel = require('../../../models/action');

const events = require('../../../services/events');
const { COMMENTS_EDIT } = require('../../../services/events/constants');
const UsersService = require('../../../services/users');
const SettingsService = require('../../../services/settings');
const CommentsService = require('../../../services/comments');

const settings = {
  id: '1',
  moderation: 'PRE',
  wordlist: { banned: ['bad words'], suspect: ['suspect words'] },
};

const chai = require('chai');
chai.use(require('sinon-chai'));
const expect = chai.expect;

const sinon = require('sinon');

describe('services.CommentsService', () => {
  const comments = [
    {
      body: 'comment 10',
      asset_id: '123',
      status_history: [],
      parent_id: '',
      author_id: '123',
      id: '1',
    },
    {
      body: 'comment 20',
      asset_id: '123',
      status_history: [
        {
          type: 'ACCEPTED',
        },
      ],
      status: 'ACCEPTED',
      parent_id: '',
      author_id: '123',
      id: '2',
    },
    {
      body: 'comment 30',
      asset_id: '456',
      status_history: [],
      parent_id: '',
      author_id: '456',
      id: '3',
    },
    {
      body: 'comment 40',
      asset_id: '123',
      status_history: [
        {
          type: 'REJECTED',
        },
      ],
      status: 'REJECTED',
      parent_id: '',
      author_id: '456',
      id: '4',
    },
    {
      body: 'comment 50',
      asset_id: '1234',
      status_history: [
        {
          type: 'PREMOD',
        },
      ],
      status: 'PREMOD',
      parent_id: '',
      author_id: '456',
      id: '5',
    },
    {
      body: 'comment 60',
      asset_id: '1234',
      status_history: [
        {
          type: 'PREMOD',
        },
      ],
      status: 'PREMOD',
      parent_id: '',
      author_id: '456',
      id: '6',
    },
  ];

  const users = [
    {
      id: 'u1',
      email: 'stampi@gmail.com',
      username: 'Stampi',
      password: '1Coral!!',
    },
    {
      email: 'sockmonster@gmail.com',
      username: 'Sockmonster',
      password: '2Coral!!',
    },
  ];

  const actions = [
    {
      action_type: 'FLAG',
      item_id: '3',
      item_type: 'COMMENTS',
      user_id: '123',
    },
    {
      action_type: 'LIKE',
      item_id: '1',
      item_type: 'COMMENTS',
      user_id: '456',
    },
  ];

  beforeEach(async () => {
    await SettingsService.init(settings);

    await Promise.all([
      CommentModel.create(comments),
      UsersService.createLocalUsers(users),
      ActionModel.create(actions),
    ]);
  });

  describe('#publicCreate()', () => {
    describe('does not allow replies to comments that are not visible', () => {
      it('parent not found', async () => {
        try {
          await CommentsService.publicCreate({
            body: 'This is a comment!',
            status: 'ACCEPTED',
            parent_id: 'does not exist',
          });
          throw new Error('comment should not have been created');
        } catch (err) {
          expect(err).to.have.property(
            'translation_key',
            'COMMENT_PARENT_NOT_VISIBLE'
          );
        }
      });

      it('parent REJECTED', async () => {
        try {
          const parent = await CommentsService.publicCreate({
            body: 'This is a comment!',
            status: 'REJECTED',
          });
          await CommentsService.publicCreate({
            body: 'This is a comment!',
            status: 'ACCEPTED',
            parent_id: parent.id,
          });
          throw new Error('comment should not have been created');
        } catch (err) {
          expect(err).to.have.property(
            'translation_key',
            'COMMENT_PARENT_NOT_VISIBLE'
          );
        }
      });

      it('parent SYSTEM_WITHHELD', async () => {
        try {
          const parent = await CommentsService.publicCreate({
            body: 'This is a comment!',
            status: 'SYSTEM_WITHHELD',
          });
          await CommentsService.publicCreate({
            body: 'This is a comment!',
            status: 'ACCEPTED',
            parent_id: parent.id,
          });
          throw new Error('comment should not have been created');
        } catch (err) {
          expect(err).to.have.property(
            'translation_key',
            'COMMENT_PARENT_NOT_VISIBLE'
          );
        }
      });
    });

    it('creates a new comment', async () => {
      const c = await CommentsService.publicCreate({
        body: 'This is a comment!',
        status: 'ACCEPTED',
      });

      expect(c).to.not.be.null;
      expect(c.id).to.not.be.null;
      expect(c.id).to.be.uuid;
      expect(c.status).to.be.equal('ACCEPTED');
    });

    it('creates many new comments', async () => {
      const [c1, c2, c3] = await CommentsService.publicCreate([
        {
          body: 'This is a comment!',
          status: 'ACCEPTED',
        },
        {
          body: 'This is another comment!',
        },
        {
          body: 'This is a rejected comment!',
          status: 'REJECTED',
        },
      ]);

      expect(c1).to.not.be.null;
      expect(c1.status).to.be.equal('ACCEPTED');

      expect(c2).to.not.be.null;
      expect(c2.status).to.be.equal('NONE');

      expect(c3).to.not.be.null;
      expect(c3.status).to.be.equal('REJECTED');
    });
  });

  describe('#edit', () => {
    it('changes the comment status back to premod if it was accepted', async () => {
      const originalComment = await CommentsService.publicCreate({
        body: 'this is a body!',
        status: 'PREMOD',
        author_id: '123',
      });

      expect(originalComment.status_history).to.have.length(1);

      await CommentsService.pushStatus(originalComment.id, 'ACCEPTED');

      let retrivedComment = await CommentsService.findById(originalComment.id);

      expect(retrivedComment).to.have.property('status', 'ACCEPTED');
      expect(retrivedComment.status_history).to.have.length(2);
      expect(retrivedComment.status_history[1]).to.have.property(
        'type',
        'ACCEPTED'
      );

      const editedComment = await CommentsService.edit({
        id: originalComment.id,
        author_id: '123',
        body: 'This is a body!',
        status: 'NONE',
      });

      expect(editedComment).to.have.property('status', 'PREMOD');
      expect(editedComment.status_history).to.have.length(4);
      expect(editedComment.status_history[3]).to.have.property(
        'type',
        'PREMOD'
      );

      retrivedComment = await CommentsService.findById(originalComment.id);

      expect(retrivedComment).to.have.property('status', 'PREMOD');
      expect(retrivedComment.status_history).to.have.length(4);
      expect(retrivedComment.status_history[3]).to.have.property(
        'type',
        'PREMOD'
      );
    });
  });

  describe('#findById()', () => {
    it('should find a comment by id', async () => {
      const comment = await CommentsService.findById('1');
      expect(comment).to.not.be.null;
      expect(comment).to.have.property('body', 'comment 10');
    });
  });

  describe('#findByAssetId()', () => {
    it('should find an array of all comments by asset id', async () => {
      const comments = await CommentsService.findByAssetId('123');
      expect(comments).to.have.length(3);
      comments.sort((a, b) => {
        if (a.body < b.body) {
          return -1;
        } else {
          return 1;
        }
      });
      expect(comments[0]).to.have.property('body', 'comment 10');
      expect(comments[1]).to.have.property('body', 'comment 20');
      expect(comments[2]).to.have.property('body', 'comment 40');
    });
  });

  describe('#changeStatus', () => {
    it('should change the status of a comment from no status', async () => {
      let comment_id = comments[0].id;

      let c = await CommentsService.findById(comment_id);
      expect(c.status).to.be.equal('NONE');

      const spy = sinon.spy();
      events.once(COMMENTS_EDIT, spy);

      let c2 = await CommentsService.pushStatus(comment_id, 'REJECTED', '123');
      expect(c2).to.have.property('status');
      expect(c2.status).to.equal('REJECTED');
      expect(c2.status_history).to.have.length(1);
      expect(c2.status_history[0]).to.have.property('type', 'REJECTED');
      expect(c2.status_history[0]).to.have.property('assigned_by', '123');

      expect(spy).to.have.been.called;

      let c3 = await CommentsService.findById(comment_id);
      expect(c3).to.have.property('status');
      expect(c3.status).to.equal('REJECTED');
      expect(c3.status_history).to.have.length(1);
      expect(c3.status_history[0]).to.have.property('type', 'REJECTED');
      expect(c3.status_history[0]).to.have.property('assigned_by', '123');
    });

    it('should change the status of a comment from accepted', async () => {
      await CommentsService.pushStatus(comments[1].id, 'REJECTED', '123');
      const c = await CommentsService.findById(comments[1].id);
      expect(c).to.have.property('status_history');
      expect(c).to.have.property('status');
      expect(c.status).to.equal('REJECTED');
      expect(c.status_history).to.have.length(2);
      expect(c.status_history[0]).to.have.property('type', 'ACCEPTED');
      expect(c.status_history[0]).to.have.property('assigned_by', null);

      expect(c.status_history[1]).to.have.property('type', 'REJECTED');
      expect(c.status_history[1]).to.have.property('assigned_by', '123');
    });
  });
});

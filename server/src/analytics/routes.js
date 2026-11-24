const express = require('express');
const {
  User, ContentItem, Interaction, LearnerProfile, Recommendation, Feedback,
} = require('../models');
const { ah } = require('../middleware/error');
const { jwtAuth, requireRole } = require('../middleware/auth');

const router = express.Router();

/** Engagement, mastery and recommendation-quality overview for instructors and admins. */
router.get('/analytics/overview', jwtAuth, requireRole('instructor', 'admin'), ah(async (req, res) => {
  const weekAgo = new Date(Date.now() - 7 * 86_400_000);

  const [learners, activeIds, published, eventsByType, topItems, masteryBySkill, recs, feedback] = await Promise.all([
    User.countDocuments({ role: 'learner' }),
    Interaction.distinct('userId', { timestamp: { $gte: weekAgo } }),
    ContentItem.countDocuments({ status: 'published' }),
    Interaction.aggregate([{ $group: { _id: '$type', count: { $sum: 1 } } }, { $sort: { count: -1 } }]),
    Interaction.aggregate([
      { $match: { type: 'complete' } },
      { $group: { _id: '$itemId', completions: { $sum: 1 } } },
      { $sort: { completions: -1 } }, { $limit: 5 },
      { $lookup: { from: 'contentitems', localField: '_id', foreignField: '_id', as: 'item' } },
      { $project: { completions: 1, title: { $first: '$item.title' } } },
    ]),
    LearnerProfile.aggregate([
      { $unwind: '$mastery' },
      { $group: { _id: '$mastery.skill', avg: { $avg: '$mastery.score' }, learners: { $sum: 1 } } },
      { $sort: { _id: 1 } },
    ]),
    Recommendation.find().select('items.itemId userId degraded generatedAt').lean(),
    Feedback.aggregate([{ $match: { verdict: { $ne: null } } }, { $group: { _id: '$verdict', count: { $sum: 1 } } }]),
  ]);

  // CTR: share of served recommendations the learner later opened.
  const served = recs.reduce((n, r) => n + r.items.length, 0);
  const clicked = recs.length
    ? await Interaction.countDocuments({
      type: { $in: ['view', 'click'] },
      $or: recs.flatMap((r) => r.items.map((i) => ({ userId: r.userId, itemId: i.itemId, timestamp: { $gte: r.generatedAt } }))),
    })
    : 0;
  const recommendedIds = new Set(recs.flatMap((r) => r.items.map((i) => String(i.itemId))));

  res.json({
    learners,
    activeLearners7d: activeIds.length,
    publishedItems: published,
    eventsByType: Object.fromEntries(eventsByType.map((e) => [e._id, e.count])),
    topItems: topItems.map((t) => ({ itemId: t._id, title: t.title, completions: t.completions })),
    masteryBySkill: masteryBySkill.map((m) => ({ skill: m._id, avg: +m.avg.toFixed(3), learners: m.learners })),
    recommendationQuality: {
      requests: recs.length,
      itemsServed: served,
      ctr: served ? +(Math.min(clicked, served) / served).toFixed(3) : 0,
      catalogueCoverage: published ? +(recommendedIds.size / published).toFixed(3) : 0,
      fallbackRate: recs.length ? +(recs.filter((r) => r.degraded).length / recs.length).toFixed(3) : 0,
      feedback: Object.fromEntries(feedback.map((f) => [f._id, f.count])),
    },
  });
}));

module.exports = router;

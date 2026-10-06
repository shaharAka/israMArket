import _test_env  # noqa: F401
import json
import unittest
from app.services.images import build_edit_prompt, build_image_prompt, visual_message
from app.services.photo_choice import Candidate, choose

class VisualMessageTest(unittest.TestCase):
    def test_current_caption_and_featured_subject_outrank_old_scene(self):
        post = {'title':'מטבח קטן', 'caption':'איך משאירים מעבר נוח במטבח קטן', 'featured_item_name':'תכנון מטבח', 'scene_description':'a luxury living room', 'goal_fit':'פניות לתכנון מטבח'}
        prompt = build_image_prompt(post, {}, {'name':'סטודיו', 'offerings':'תכנון מטבחים'})
        self.assertIn('מעבר נוח במטבח', prompt)
        self.assertIn('תכנון מטבח', prompt)
        self.assertIn('current caption outrank', prompt)
        self.assertIn('Secondary scene direction', prompt)
        self.assertIn('not evidence of real work', prompt)

    def test_source_data_is_bounded_and_serialized(self):
        message = json.loads(visual_message({'caption':'x' * 9000, 'title':{'bad':'shape'}, 'cta':'קראו עוד'}))
        self.assertEqual(len(message['message']),1500)
        self.assertNotIn('title',message)
        self.assertEqual(message['action'],'קראו עוד')

    def test_old_scene_cannot_pick_an_unrelated_real_photo(self):
        photo = Candidate('library:1', 'library', 'living room sofa', lambda:(b'photo','image/jpeg'))
        post = {'title':'מטבח קטן', 'caption':'איך מתכננים מעבר במטבח', 'scene_description':'living room sofa'}
        self.assertIsNone(choose([photo], post, {}))

    def test_own_topic_photo_is_used_without_any_model(self):
        photo = Candidate('library:1', 'library', 'תכנון מטבח קטן מעבר', lambda:(b'photo','image/jpeg'))
        picked = choose([photo], {'title':'מטבח קטן', 'caption':'מעבר נוח'}, {})
        self.assertEqual(picked[0].key,'library:1')

    def test_edit_uses_current_message_without_replacing_real_subject(self):
        prompt = build_edit_prompt({"title": "פרט בחיבור", "caption": "חיבור עץ נקי ללא ברגים גלויים"}, None, {"name": "נגרייה"})
        self.assertIn("ללא ברגים גלויים", prompt)
        self.assertIn("Never change the photographed subject", prompt)
        self.assertIn("Add nothing to the scene", prompt)

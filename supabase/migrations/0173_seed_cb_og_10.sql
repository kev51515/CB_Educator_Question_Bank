-- =============================================================================
-- Migration: 0173_seed_cb_og_10.sql
-- Purpose:   Seed "CB OG #10" (College Board linear Digital SAT practice test,
--            66 RW + 54 Math = 120 Q) into the full-test tables from 0048.
--   Source:  sat-practice-test-10-digital.pdf; official College Board answer key (pdf/Key/).
--   Idempotent upsert on (slug)/(test_id,position)/(module_id,position).
-- =============================================================================
DO $seed$
DECLARE v_test uuid; v_mod uuid;
BEGIN
  INSERT INTO public.tests (slug, ordinal, title, short_title, source, total_questions)
  VALUES ('cb-og-10', 16, 'CB OG #10', 'CB OG #10', 'sat-practice-test-10-digital.pdf', 120)
  ON CONFLICT (slug) DO UPDATE SET ordinal=EXCLUDED.ordinal, title=EXCLUDED.title,
    short_title=EXCLUDED.short_title, source=EXCLUDED.source, total_questions=EXCLUDED.total_questions
  RETURNING id INTO v_test;

  INSERT INTO public.test_modules (test_id, position, section, label, time_limit_seconds, question_count)
  VALUES (v_test, 1, 'reading-writing', 'Reading and Writing — Module 1', 1920, 33)
  ON CONFLICT (test_id, position) DO UPDATE SET section=EXCLUDED.section, label=EXCLUDED.label,
    time_limit_seconds=EXCLUDED.time_limit_seconds, question_count=EXCLUDED.question_count
  RETURNING id INTO v_mod;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 1, '1-1', 1, 'mcq', NULL, NULL, 'The general store was essential to daily life in the rural United States during the 1800s because it provided the supplies that the people living in nearby communities needed. Also, the store was a ______ of information. People socializing at the general store would share news and help spread it throughout their communities.

Which choice completes the text with the most logical and precise word or phrase?', '{"A":"source","B":"rival","C":"condition","D":"waste"}'::jsonb, NULL, 'A', NULL, NULL, 2)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 2, '1-2', 2, 'mcq', NULL, NULL, 'For painter Jacob Lawrence, being ______ was an important part of the artistic process. Because he paid close attention to all the details of his Harlem neighborhood, Lawrence''s artwork captured nuances in the beauty and vitality of the Black experience during the Harlem Renaissance and the Great Migration.

Which choice completes the text with the most logical and precise word or phrase?', '{"A":"skeptical","B":"observant","C":"critical","D":"confident"}'::jsonb, NULL, 'B', NULL, NULL, 2)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 3, '1-3', 3, 'mcq', NULL, NULL, 'Former astronaut Ellen Ochoa says that although she doesn''t have a definite idea of when it might happen, she ______ that humans will someday need to be able to live in other environments than those found on Earth. This conjecture informs her interest in future research missions to the moon.

Which choice completes the text with the most logical and precise word or phrase?', '{"A":"demands","B":"speculates","C":"doubts","D":"establishes"}'::jsonb, NULL, 'B', NULL, NULL, 3)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 4, '1-4', 4, 'mcq', NULL, NULL, 'The parasitic dodder plant increases its reproductive success by flowering at the same time as the host plant it has latched onto. In 2020, Jianqang Wu and his colleagues determined that the tiny dodder achieves this ______ with its host by absorbing and utilizing a protein the host produces when it is about to flower.

Which choice completes the text with the most logical and precise word or phrase?', '{"A":"synchronization","B":"hibernation","C":"prediction","D":"moderation"}'::jsonb, NULL, 'A', NULL, NULL, 3)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 5, '1-5', 5, 'mcq', NULL, NULL, 'Barring major archaeological discoveries, we are unlikely to ever have ______ account of ancient Egypt under the female pharaoh Hatshepsut, as much of the evidence of her reign was deliberately destroyed by her successors.

Which choice completes the text with the most logical and precise word or phrase?', '{"A":"an imaginative","B":"a superficial","C":"an exhaustive","D":"a questionable"}'::jsonb, NULL, 'C', NULL, NULL, 3)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 6, '1-6', 6, 'mcq', NULL, NULL, 'Jazz tap is a dance form that was first developed in African American communities. Jazz tap was heavily influenced by jazz music, which became widely popular in the United States in the 1920s. Tap dancers were inspired by jazz music''s quick rhythms and by the way jazz musicians would make up melodies as they played. As jazz music continued to develop in the 1930s and 1940s, jazz tap evolved with it. As a result of jazz music''s influence, jazz tap quickly developed into a dance form that was very different from earlier kinds of tap dance.

Which choice best states the main purpose of the text?', '{"A":"It explains why audiences prefer some kinds of music over others.","B":"It discusses the development of a dance form.","C":"It describes how to play a musical instrument.","D":"It emphasizes the popularity of a famous dancer."}'::jsonb, NULL, 'B', NULL, NULL, 3)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 7, '1-7', 7, 'mcq', NULL, NULL, 'The north celestial pole (NCP)—the fixed point around which stars in the Northern Hemisphere (including the Sun) appear to rotate—is discernible only at night. Inspired by the navigational strategies of some insects and birds, researchers devised a method for locating the NCP in daytime using skylight polarization, which occurs as atmospheric particles scatter sunlight. A polarimetric camera captures images of polarization patterns, which rotate as the Sun''s position in the sky changes; temporal variances across images can then be used to determine an observer''s latitude and bearing relative to the NCP.

Which choice best describes the overall structure of the text?', '{"A":"It illustrates how most navigational tools utilize the NCP, recounts how researchers discovered that certain animals are able to navigate without using the NCP, and then proposes that this discovery could be used to avoid problems in navigation associated with reliance on the NCP.","B":"It presents a celestial-based method of navigation, enumerates the comparative benefits of an alternative method used by certain animals that is based on an unrelated natural occurrence, and then indicates how researchers assessed the relative accuracy of the two methods.","C":"It explains how the NCP is typically located, emphasizes a key difference between how humans and certain animals use the NCP for navigation, and then suggests an alternative way of using the NCP to improve existing navigational instruments.","D":"It notes an obstacle to observing an astronomical phenomenon, mentions a navigational ability of certain animals that inspired a solution to that obstacle, and then explains how researchers used an optical device to mimic that ability."}'::jsonb, NULL, 'D', NULL, NULL, 4)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 8, '1-8', 8, 'mcq', 'The following text is adapted from Zora Neale Hurston''s 1921 short story "John Redding Goes to Sea." John is a child who lives in a town in the woods.

Perhaps ten-year-old John was puzzling to the folk there in the Florida woods for he was an imaginative child and fond of day-dreams. The St. John River flowed a scarce three hundred feet from his back door. On its banks at this point grow numerous palms, luxuriant magnolias and bay trees. On the bosom of the stream float millions of those tiny blue-and-white wax-bloom called water-hyacinths. [John Redding] loved to wander down to the water''s edge, and, casting in dry twigs, watch them sail away down stream to Jacksonville, the sea, the wide world and [he] wanted to follow them.', NULL, 'Which choice best describes the function of the underlined sentence in the text as a whole?', '{"A":"It provides an extended description of a location that John likes to visit.","B":"It reveals that residents of John''s town are confused by his behavior.","C":"It illustrates the uniqueness of John''s imagination compared to the imaginations of other children.","D":"It suggests that John longs to experience a larger life outside the Florida woods."}'::jsonb, NULL, 'D', NULL, NULL, 4)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 9, '1-9', 9, 'mcq', NULL, NULL, 'Astronomers are confident that the star Betelgeuse will eventually consume all the helium in its core and explode in a supernova. They are much less confident, however, about when this will happen, since that depends on internal characteristics of Betelgeuse that are largely unknown. Astrophysicist Sarafina El-Badry Nance and colleagues recently investigated whether acoustic waves in the star could be used to determine internal stellar states but concluded that this method could not sufficiently reveal Betelgeuse''s internal characteristics to allow its evolutionary state to be firmly fixed.

Which choice best describes the function of the second sentence in the overall structure of the text?', '{"A":"It describes a serious limitation of the method used by Nance and colleagues.","B":"It presents the central finding reported by Nance and colleagues.","C":"It identifies the problem that Nance and colleagues attempted to solve but did not.","D":"It explains how the work of Nance and colleagues was received by others in the field."}'::jsonb, NULL, 'C', NULL, NULL, 5)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 10, '1-10', 10, 'mcq', 'Text 1
Astronomer Mark Holland and colleagues examined four white dwarfs—small, dense remnants of past stars—in order to determine the composition of exoplanets that used to orbit those stars. Studying wavelengths of light in the white dwarf atmospheres, the team reported that traces of elements such as lithium and sodium support the presence of exoplanets with continental crusts similar to Earth''s.

Text 2
Past studies of white dwarf atmospheres have concluded that certain exoplanets had continental crusts. Geologist Keith Putirka and astronomer Siyi Xu argue that these studies unduly emphasize atmospheric traces of lithium and other individual elements as signifiers of the types of rock found on Earth. The studies don''t adequately account for different minerals made up of various ratios of those elements, and the possibility of rock types not found on Earth that contain those minerals.', NULL, 'Based on the texts, how would Putirka and Xu (Text 2) most likely characterize the conclusion presented in Text 1?', '{"A":"As unexpected, because it was widely believed at the time that white dwarf exoplanets lack continental crusts","B":"As premature, because researchers have only just begun trying to determine what kinds of crusts white dwarf exoplanets had","C":"As questionable, because it rests on an incomplete consideration of potential sources of the elements detected in white dwarf atmospheres","D":"As puzzling, because it''s unusual to successfully detect lithium and sodium when analyzing wavelengths of light in white dwarf atmospheres"}'::jsonb, NULL, 'C', NULL, NULL, 5)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 11, '1-11', 11, 'mcq', 'The following text is from David Barclay Moore''s 2022 novel Holler of the Fireflies. The narrator has just arrived at summer camp, which is far away from his home.

This place was different than I thought it would be. I''d never been somewhere like this before. I did feel scared, but also excited.', NULL, 'According to the text, how does the narrator feel about being at summer camp?', '{"A":"He feels confused.","B":"He feels peaceful.","C":"He feels both scared and excited.","D":"He feels both angry and jealous."}'::jsonb, NULL, 'C', NULL, NULL, 6)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 12, '1-12', 12, 'mcq', 'The following text is adapted from Oscar Wilde''s 1891 novel The Picture of Dorian Gray. Dorian is taking his first look at a portrait that Hallward has painted of him.

Dorian passed listlessly in front of his picture and turned towards it. When he saw it he drew back, and his cheeks flushed for a moment with pleasure. A look of joy came into his eyes, as if he had recognized himself for the first time. He stood there motionless and in wonder, dimly conscious that Hallward was speaking to him, but not catching the meaning of his words. The sense of his own beauty came on him like a revelation. He had never felt it before.', NULL, 'According to the text, what is true about Dorian?', '{"A":"He wants to know Hallward''s opinion of the portrait.","B":"He is delighted by what he sees in the portrait.","C":"He prefers portraits to other types of paintings.","D":"He is uncertain of Hallward''s talent as an artist."}'::jsonb, NULL, 'B', NULL, NULL, 6)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 13, '1-13', 13, 'mcq', NULL, NULL, 'Choctaw/Cherokee artist Jeffrey Gibson turns punching bags used by boxers into art by decorating them with beadwork and elements of Native dressmaking. These elements include leather fringe and jingles, the metal cones that cover the dresses worn in the jingle dance, a women''s dance of the Ojibwe people. Thus, Gibson combines an object commonly associated with masculinity (a punching bag) with art forms traditionally practiced by women in most Native communities (beadwork and dressmaking). In this way, he rejects the division of male and female gender roles.

Which choice best describes Gibson''s approach to art, as presented in the text?', '{"A":"He draws from traditional Native art forms to create his original works.","B":"He has been influenced by Native and non-Native artists equally.","C":"He finds inspiration from boxing in designing the dresses he makes.","D":"He rejects expectations about color and pattern when incorporating beadwork."}'::jsonb, NULL, 'A', NULL, NULL, 7)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 14, '1-14', 14, 'mcq', 'O Pioneers! is a 1913 novel by Willa Cather. In the novel, Cather portrays Alexandra Bergson as having a deep emotional connection to her natural surroundings: ______', NULL, 'Which quotation from O Pioneers! most effectively illustrates the claim?', '{"A":"\"She had never known before how much the country meant to her. The chirping of the insects down in the long grass had been like the sweetest music. She had felt as if her heart were hiding down there, somewhere, with the quail and the plover and all the little wild things that crooned or buzzed in the sun. Under the long shaggy ridges, she felt the future stirring.\"","B":"\"Alexandra talked to the men about their crops and to the women about their poultry. She spent a whole day with one young farmer who had been away at school, and who was experimenting with a new kind of clover hay. She learned a great deal.\"","C":"\"Alexandra drove off alone. The rattle of her wagon was lost in the howling of the wind, but her lantern, held firmly between her feet, made a moving point of light along the highway, going deeper and deeper into the dark country.\"","D":"\"It was Alexandra who read the papers and followed the markets, and who learned by the mistakes of their neighbors. It was Alexandra who could always tell about what it had cost to fatten each steer, and who could guess the weight of a hog before it went on the scales closer than John Bergson [her father] himself.\""}'::jsonb, NULL, 'A', NULL, NULL, 7)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 15, '1-15', 15, 'mcq', NULL, NULL, 'The novelist Toni Morrison was the first Black woman to work as an editor at the publishing company Random House, from 1967 to 1983. A scholar asserts that one of Morrison''s likely aims during her time as an editor was to strengthen the presence of Black writers on the list of Random House''s published authors.

Which finding, if true, would most strongly support the scholar''s claim?', '{"A":"The percentage of authors published by Random House who were Black rose in the early 1970s and stabilized throughout the decade.","B":"Black authors who were interviewed in the 1980s and 1990s were highly likely to cite Toni Morrison''s novels as a principal influence on their work.","C":"The novels written by Toni Morrison that were published after 1983 sold significantly more copies and received more critical acclaim than the novels she wrote that were published before 1983.","D":"Works that were edited by Toni Morrison during her time at Random House displayed stylistic characteristics that distinguished them from works that were not edited by Morrison."}'::jsonb, NULL, 'A', NULL, NULL, 8)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 16, '1-16', 16, 'mcq', NULL, NULL, 'Archaeologist Petra Vaiglova, anthropologist Xinyi Liu, and their colleagues investigated the domestication of farm animals in China during the Bronze Age (approximately 2000 to 1000 BCE). By analyzing the chemical composition of the bones of sheep, goats, and cattle from this era, the team determined that what plants made up the bulk of sheep''s and goats'' diets, while the cattle''s diet consisted largely of millet, a crop cultivated by humans. The team concluded that cattle were likely raised closer to human settlements, whereas sheep and goats were allowed to roam farther away.

Which finding, if true, would most strongly support the team''s conclusion?', '{"A":"Analysis of the animal bones showed that the cattle''s diet also consisted of wheat, which humans widely cultivated in China during the Bronze Age.","B":"Further investigation of sheep and goat bones revealed that their diets consisted of small portions of millet as well.","C":"Cattle''s diets generally require larger amounts of food and a greater variety of nutrients than do sheep''s and goats'' diets.","D":"The diets of sheep, goats, and cattle were found to vary based on what the farmers in each Bronze Age settlement could grow."}'::jsonb, NULL, 'A', NULL, NULL, 8)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 17, '1-17', 17, 'mcq', '(Figure: Line graph titled "Average Survival of Fruit Flies following Infection." X-axis: "Days after infection" (0, 2, 6, 10, 14). Y-axis: "Survival rate (% alive)" (0 to 110 by 10s). Three series: type A flies (solid line, filled triangles) stays high, declining from 100% to about 90% by day 14; type AB flies (dashed line, open squares) drops from 100% to about 45% at day 6, about 11% at day 10, near 0% at day 14; type B flies (dotted line, open circles) drops from 100% to about 41% at day 6, near 0% by day 10–14.)', 'Line graph titled "Average Survival of Fruit Flies following Infection." X-axis: "Days after infection" (0, 2, 6, 10, 14). Y-axis: "Survival rate (% alive)" (0 to 110 by 10s). Three series: type A flies (solid line, filled triangles) stays high, declining from 100% to about 90% by day 14; type AB flies (dashed line, open squares) drops from 100% to about 45% at day 6, about 11% at day 10, near 0% at day 14; type B flies (dotted line, open circles) drops from 100% to about 41% at day 6, near 0% by day 10–14.', 'In a study of the evolution of DptA and DptB—Diptericin genes encoding antimicrobial peptides that combat pathogens and foster beneficial microbes in fruit flies (Drosophila)—researchers assessed Drosophila melanogaster resistance to pathogenic infections by Providencia rettgeri and Acetobacter sicerae, bacteria common in the flies'' environments. Subjects included flies identified by mutations silencing DptA, DptB, or both DptA and DptB (termed types A, B, and AB, respectively). In conjunction with the observation that resistance to P. rettgeri correlates with DptA activity but is not significantly affected by DptB activity, data in the graph of survival rates post–A. sicerae infection suggest that ______

Which completion of the text is best supported by data in the graph?', '{"A":"DptA confers defense against A. sicerae regardless of the presence of DptB.","B":"DptB protects against only one bacteria species, whereas DptA protects against multiple species.","C":"DptB may have developed as a specific defense against A. sicerae.","D":"defense against A. sicerae is strongest when both DptA and DptB are present."}'::jsonb, NULL, 'C', NULL, NULL, 9)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 18, '1-18', 18, 'mcq', NULL, NULL, 'Euphorbia esula (leafy spurge) is a Eurasian plant that has become invasive in North America, where it displaces native vegetation and sickens cattle. E. esula can be controlled with chemical herbicides, but that approach can also kill harmless plants nearby. Recent research on introducing engineered DNA into plant species to inhibit their reproduction may offer a path toward exclusively targeting E. esula, consequently ______

Which choice most logically completes the text?', '{"A":"making individual E. esula plants more susceptible to existing chemical herbicides.","B":"enhancing the ecological benefits of E. esula in North America.","C":"enabling cattle to consume E. esula without becoming sick.","D":"reducing invasive E. esula numbers without harming other organisms."}'::jsonb, NULL, 'D', NULL, NULL, 10)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 19, '1-19', 19, 'mcq', NULL, NULL, 'A team of biologists led by Jae-Hoon Jung, Antonio D. Barbosa, and Stephanie Hutin investigated the mechanism that allows Arabidopsis thaliana (thale cress) plants to accelerate flowering at high temperatures. They replaced the protein ELF3 in the plants with a similar protein found in another species (stiff brome) that, unlike A. thaliana, displays no acceleration in flowering with increased temperature. A comparison of unmodified A. thaliana plants with the altered plants showed no difference in flowering at 22° Celsius, but at 27° Celsius, the unmodified plants exhibited accelerated flowering while the altered ones did not, which suggests that ______

Which choice most logically completes the text?', '{"A":"temperature-sensitive accelerated flowering is unique to A. thaliana.","B":"A. thaliana increases ELF3 production as temperatures rise.","C":"ELF3 enables A. thaliana to respond to increased temperatures.","D":"temperatures of at least 22° Celsius are required for A. thaliana to flower."}'::jsonb, NULL, 'C', NULL, NULL, 10)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 20, '1-20', 20, 'mcq', NULL, NULL, 'The Alvarez theory, developed in 1980 by physicist Luis Walter Alvarez and his geologist son Walter Alvarez, maintained that the secondary effects of an asteroid impact caused many dinosaurs and other animals to die ______ it left unexplored the question of whether unrelated volcanic activity might have also contributed to the mass extinctions.

Which choice completes the text so that it conforms to the conventions of Standard English?', '{"A":"out but","B":"out, but","C":"out","D":"out,"}'::jsonb, NULL, 'B', NULL, NULL, 10)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 21, '1-21', 21, 'mcq', NULL, NULL, 'Typically, underlines, scribbles, and notes left in the margins by a former owner lower a book''s ______ when the former owner is a famous poet like Walt Whitman, such markings, known as marginalia, can be a gold mine to literary scholars.

Which choice completes the text so that it conforms to the conventions of Standard English?', '{"A":"value, but","B":"value","C":"value,","D":"value but"}'::jsonb, NULL, 'A', NULL, NULL, 11)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 22, '1-22', 22, 'mcq', NULL, NULL, 'In winter, the diets of Japanese macaques, also known as snow monkeys, are influenced more by food availability than by food preference. Although the monkeys prefer to eat vegetation and land-dwelling invertebrates, those food sources may become unavailable because of extensive snow and ice cover, ______ the monkeys to hunt for marine animals in any streams that have not frozen over.

Which choice completes the text so that it conforms to the conventions of Standard English?', '{"A":"forces","B":"to force","C":"forcing","D":"forced"}'::jsonb, NULL, 'C', NULL, NULL, 11)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 23, '1-23', 23, 'mcq', NULL, NULL, 'While many video game creators strive to make their graphics ever more ______ others look to the past, developing titles with visuals inspired by the "8-bit" games of the 1980s and 1990s. (The term "8-bit" refers to a console whose processor could only handle eight bits of data at once.)

Which choice completes the text so that it conforms to the conventions of Standard English?', '{"A":"lifelike but","B":"lifelike","C":"lifelike,","D":"lifelike, but"}'::jsonb, NULL, 'C', NULL, NULL, 11)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 24, '1-24', 24, 'mcq', NULL, NULL, 'Food and the sensation of taste are central to Monique Truong''s novels. In The Book of Salt, for example, the exiled character of Bình connects to his native Saigon through the food he prepares, while in Bitter in the Mouth, the character of Linda ______ a form of synesthesia whereby the words she hears evoke tastes.

Which choice completes the text so that it conforms to the conventions of Standard English?', '{"A":"experienced","B":"had experienced","C":"experiences","D":"will be experiencing"}'::jsonb, NULL, 'C', NULL, NULL, 11)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 25, '1-25', 25, 'mcq', NULL, NULL, 'Along with carbon dioxide concentration and temperature, light intensity affects the chemical reaction rate of ______ as light intensity increases, so does the rate at which the reactants (water and carbon dioxide) are converted into their products (glucose and oxygen).

Which choice completes the text so that it conforms to the conventions of Standard English?', '{"A":"photosynthesis and","B":"photosynthesis,","C":"photosynthesis:","D":"photosynthesis"}'::jsonb, NULL, 'C', NULL, NULL, 12)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 26, '1-26', 26, 'mcq', NULL, NULL, 'In Marisol''s 1968 sculpture Mi Mama y Yo, gone are the types of pop culture references that made the Parisian-born Venezuelan American artist a star at the height of the pop art movement. In ______ place is a far more personal subject: a sculptural depiction of the artist as a young girl with her mother.

Which choice completes the text so that it conforms to the conventions of Standard English?', '{"A":"its","B":"they''re","C":"their","D":"it''s"}'::jsonb, NULL, 'C', NULL, NULL, 12)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 27, '1-27', 27, 'mcq', NULL, NULL, 'The ghazal, a poetic form originating in seventh-century Arabic poetry, has an intricate structure. The twentieth-century Kashmiri American poet Agha Shahid Ali explains that each one of a ghazal''s couplets, while adhering to the patterns of rhyme (qafia) and refrain (radif) established in the poem''s opening lines (matla), ______ thematically and logically autonomous, resulting in a poem with "a stringently formal disunity."

Which choice completes the text so that it conforms to the conventions of Standard English?', '{"A":"is","B":"were","C":"have been","D":"are"}'::jsonb, NULL, 'A', NULL, NULL, 12)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 28, '1-28', 28, 'mcq', NULL, NULL, 'Organisms have evolved a number of surprising adaptations to ensure their survival in adverse conditions. Tadpole shrimp (Triops longicaudatus) embryos, ______ can pause development for over ten years during extended periods of drought.

Which choice completes the text with the most logical transition?', '{"A":"in contrast,","B":"for example,","C":"meanwhile,","D":"consequently,"}'::jsonb, NULL, 'B', NULL, NULL, 12)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 29, '1-29', 29, 'mcq', NULL, NULL, 'When Chinese director Chloé Zhao accepted the Oscar in 2021 for her film Nomadland, she made Academy Award history. ______ only one other woman, Kathryn Bigelow of the United States, had been named best director at the Oscars, making Zhao the second woman and the first Asian woman to win the award.

Which choice completes the text with the most logical transition?', '{"A":"As a result,","B":"Previously,","C":"However,","D":"Likewise,"}'::jsonb, NULL, 'B', NULL, NULL, 13)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 30, '1-30', 30, 'mcq', NULL, NULL, 'If the formation of Earth''s mantle had been purely a product of core differentiation—whereby heavier elements sink toward the core and lighter elements rise—the upper mantle would be depleted of heavy siderophile elements. Siderophiles are much more abundant in the mantle than predicted in that model, however. ______ extraterrestrial material containing siderophiles, likely from asteroid or comet impacts, almost certainly accreted to Earth following core differentiation.

Which choice completes the text with the most logical transition?', '{"A":"That said,","B":"Hence,","C":"For example,","D":"Likewise,"}'::jsonb, NULL, 'B', NULL, NULL, 13)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 31, '1-31', 31, 'mcq', 'While researching a topic, a student has taken the following notes:
• In 2013, archaeologists studied cat bone fragments they had found in the ruins of Quanhucun, a Chinese farming village.
• The fragments were estimated to be 5,300 years old.
• A chemical analysis of the fragments revealed that the cats had consumed large amounts of grain.
• The grain consumption is evidence that the Quanhucun cats may have been domesticated.', NULL, 'The student wants to present the Quanhucun study and its conclusions. Which choice most effectively uses relevant information from the notes to accomplish this goal?', '{"A":"As part of a 2013 study of cat domestication, a chemical analysis was conducted on cat bone fragments found in Quanhucun, China.","B":"A 2013 analysis of cat bone fragments found in Quanhucun, China, suggests that cats there may have been domesticated 5,300 years ago.","C":"In 2013, archaeologists studied what cats in Quanhucun, China, had eaten more than 5,000 years ago.","D":"Cat bone fragments estimated to be 5,300 years old were found in Quanhucun, China, in 2013."}'::jsonb, NULL, 'B', NULL, NULL, 13)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 32, '1-32', 32, 'mcq', 'While researching a topic, a student has taken the following notes:
• Gaspar Enriquez is an artist.
• He specializes in portraits of Mexican Americans.
• A portrait is an artistic representation of a person.
• Enriquez completed a painting of the sculptor Luis Jimenez in 2003.
• He completed a drawing of the writer Rudolfo Anaya in 2016.', NULL, 'The student wants to emphasize a difference between the two portraits. Which choice most effectively uses relevant information from the notes to accomplish this goal?', '{"A":"The portraits, or artistic representations, of Luis Jimenez and Rudolfo Anaya were both completed by Enriquez in the early 2000s.","B":"Enriquez has completed portraits of numerous Mexican Americans, including sculptor Luis Jimenez and writer Rudolfo Anaya.","C":"While both are by Enriquez, the 2003 portrait of Luis Jimenez is a painting, and the 2016 portrait of Rudolfo Anaya is a drawing.","D":"Luis Jimenez was a Mexican American sculptor, and Rudolfo Anaya was a Mexican American writer."}'::jsonb, NULL, 'C', NULL, NULL, 14)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 33, '1-33', 33, 'mcq', 'While researching a topic, a student has taken the following notes:
• The Gullah are a group of African Americans who have lived in parts of the southeastern United States since the 18th century.
• Gullah culture is influenced by West African and Central African traditions.
• Louise Miller Cohen is a Gullah historian, storyteller, and preservationist.
• She founded the Gullah Museum of Hilton Head Island, South Carolina, in 2003.
• Vermelle Rodrigues is a Gullah historian, artist, and preservationist.
• She founded the Gullah Museum of Georgetown, South Carolina, in 2003.', NULL, 'The student wants to emphasize the duration and purpose of Cohen''s and Rodrigues''s work. Which choice most effectively uses relevant information from the notes to accomplish this goal?', '{"A":"At the Gullah Museums in Hilton Head Island and Georgetown, South Carolina, visitors can learn more about the Gullah people who have lived in the region for centuries.","B":"Louise Miller Cohen and Vermelle Rodrigues have worked to preserve the culture of the Gullah people, who have lived in the United States since the 18th century.","C":"Since 2003, Louise Miller Cohen and Vermelle Rodrigues have worked to preserve Gullah culture through their museums.","D":"Influenced by the traditions of West and Central Africa, Gullah culture developed in parts of the southeastern United States since the 18th century."}'::jsonb, NULL, 'C', NULL, NULL, 14)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;

  INSERT INTO public.test_modules (test_id, position, section, label, time_limit_seconds, question_count)
  VALUES (v_test, 2, 'reading-writing', 'Reading and Writing — Module 2', 1920, 33)
  ON CONFLICT (test_id, position) DO UPDATE SET section=EXCLUDED.section, label=EXCLUDED.label,
    time_limit_seconds=EXCLUDED.time_limit_seconds, question_count=EXCLUDED.question_count
  RETURNING id INTO v_mod;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 1, '2-1', 1, 'mcq', 'In the early 1800s, the Cherokee scholar Sequoyah created the first script, or writing system, for an Indigenous language in the United States. Because it represented the sounds of spoken Cherokee so accurately, his script was easy to learn and thus quickly achieved ______ use: by 1830, over 90 percent of the Cherokee people could read and write it.', NULL, 'Which choice completes the text with the most logical and precise word or phrase?', '{"A":"widespread","B":"careful","C":"unintended","D":"infrequent"}'::jsonb, NULL, 'A', NULL, NULL, 18)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 2, '2-2', 2, 'mcq', 'Researchers have struggled to pinpoint specific causes for hiccups, which happen when a person''s diaphragm contracts ______. However, neuroscientist Kimberley Whitehead has found that these uncontrollable contractions may play an important role in helping infants regulate their breathing.', NULL, 'Which choice completes the text with the most logical and precise word or phrase?', '{"A":"involuntarily","B":"beneficially","C":"strenuously","D":"smoothly"}'::jsonb, NULL, 'A', NULL, NULL, 18)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 3, '2-3', 3, 'mcq', 'The province of Xoconochco was situated on the Pacific coast, hundreds of kilometers southeast of Tenochtitlan, the capital of the Aztec Empire. Because Xoconochco''s location within the empire was so ______, cacao and other trade goods produced there could reach the capital only after a long overland journey.', NULL, 'Which choice completes the text with the most logical and precise word or phrase?', '{"A":"unobtrusive","B":"concealed","C":"approximate","D":"peripheral"}'::jsonb, NULL, 'D', NULL, NULL, 19)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 4, '2-4', 4, 'mcq', 'Proposals to raise the age at which retirees begin receiving government transfers of funds are generally discussed in terms of the effects on transfer recipients, but Andria Smythe has argued that delaying such transfers could ______ wealth creation among working adults by lengthening the period in which they are providing financial support to their nonworking parents.', NULL, 'Which choice completes the text with the most logical and precise word or phrase?', '{"A":"stymie","B":"compound","C":"disparage","D":"outstrip"}'::jsonb, NULL, 'A', NULL, NULL, 19)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 5, '2-5', 5, 'mcq', 'Political blogs with conspicuous ideological alignments became an integral component of US media in the early 2000s. While some commentators lauded this development, asserting that such blogs had a welcome transparency missing from traditional news, less ______ observers countered that such blogs tended to ideological extremes that exacerbated political polarization to problematic levels.', NULL, 'Which choice completes the text with the most logical and precise word or phrase?', '{"A":"sanguine","B":"recalcitrant","C":"misanthropic","D":"earnest"}'::jsonb, NULL, 'A', NULL, NULL, 19)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 6, '2-6', 6, 'mcq', 'The following text is adapted from Pam Muñoz Ryan''s 2020 novel Mañanaland. In the village where Max lives, there is an old fortress called La Reina. Children in the village say that the fortress is haunted.

For as long as he could remember, Max had begged Papá [his father] to take him to see La Reina and the ruins up close. He''d be a hero among his friends if he was the first boy to cross the haunted gates! Just because Papá didn''t believe in ghosts didn''t mean they weren''t there. Maybe this summer Papá would finally take him. He was almost twelve.', NULL, 'Which choice best describes the overall purpose of the text?', '{"A":"To portray how proud Max''s father is of Max","B":"To explain why Max doesn''t want to grow up yet","C":"To criticize Max for disliking summer","D":"To show how much Max wants to visit La Reina"}'::jsonb, NULL, 'D', NULL, NULL, 20)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 7, '2-7', 7, 'mcq', 'The following text is adapted from George Bernard Shaw''s 1912 play Pygmalion. Henry Higgins has just arrived at the house of his mother (Mrs. Higgins). She is expecting her friends to visit soon.

MRS. HIGGINS: I''m serious, Henry. You offend all my friends: they stop coming whenever they meet you.

HIGGINS: Nonsense! I know I have no small talk; but people don''t mind.

MRS. HIGGINS: Oh! don''t they? Small talk indeed! What about your large talk? Really, dear, you mustn''t stay.', NULL, 'Which choice best states the main purpose of the text?', '{"A":"To describe what Henry''s mother does when she goes out with her friends","B":"To show that Henry''s mother wants him to leave","C":"To present a detailed account of what Henry''s home looks like","D":"To explain why Henry often visits his mother"}'::jsonb, NULL, 'B', NULL, NULL, 20)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 8, '2-8', 8, 'mcq', 'The following text is from Charlotte Forten Grimké''s 1888 poem "At Newport."

Oh, deep delight to watch the gladsome waves
Exultant leap upon the rugged rocks;
Ever repulsed, yet ever rushing on—
Filled with a life that will not know defeat;
To see the glorious hues of sky and sea.
The distant snowy sails, glide spirit like,
Into an unknown world, to feel the sweet
Enchantment of the sea thrill all the soul,
Clearing the clouded brain, making the heart
Leap joyous as it own bright, singing waves!', NULL, 'Which choice best describes the function of the underlined portion in the text as a whole?', '{"A":"It portrays the surroundings as an imposing and intimidating scene.","B":"It characterizes the sea''s waves as a relentless and enduring force.","C":"It conveys the speaker''s ambivalence about the natural world.","D":"It draws a contrast between the sea''s waves and the speaker''s thoughts."}'::jsonb, NULL, 'B', NULL, NULL, 21)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 9, '2-9', 9, 'mcq', 'Believing that living in an impractical space can heighten awareness and even improve health, conceptual artists Madeline Gins and Shusaku Arakawa designed an apartment building in Japan to be more fanciful than functional. A kitchen counter is chest-high on one side and knee-high on the other; a ceiling has a door to nowhere. The effect is disorienting but invigorating: after four years there, filmmaker Nobu Yamaoka reported significant health benefits.', NULL, 'Which choice best states the main idea of the text?', '{"A":"Although inhabiting a home surrounded by fanciful features such as those designed by Gins and Arakawa can be rejuvenating, it is unsustainable.","B":"Designing disorienting spaces like those in the Gins and Arakawa building is the most effective way to create a physically stimulating environment.","C":"As a filmmaker, Yamaoka has long supported the designs of conceptual artists such as Gins and Arakawa.","D":"Although impractical, the design of the apartment building by Gins and Arakawa may improve the well-being of the building''s residents."}'::jsonb, NULL, 'D', NULL, NULL, 21)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 10, '2-10', 10, 'mcq', 'The following text is adapted from Lewis Carroll''s 1889 satirical novel Sylvie and Bruno. A crowd has gathered outside a room belonging to the Warden, an official who reports to the Lord Chancellor.

One man, who was more excited than the rest, flung his hat high into the air, and shouted (as well as I could make out) "Who roar for the Sub-Warden?" Everybody roared, but whether it was for the Sub-Warden, or not, did not clearly appear: some were shouting "Bread!" and some "Taxes!", but no one seemed to know what it was they really wanted.
All this I saw from the open window of the Warden''s breakfast-saloon, looking across the shoulder of the Lord Chancellor.
"What can it all mean?" he kept repeating to himself. "I never heard such shouting before—and at this time of the morning, too! And with such unanimity!"', NULL, 'Based on the text, how does the Lord Chancellor respond to the crowd?', '{"A":"He asks about the meaning of the crowd''s shouting, even though he claims to know what the crowd wants.","B":"He indicates a desire to speak to the crowd, even though the crowd has asked to speak to the Sub-Warden.","C":"He expresses sympathy for the crowd''s demands, even though the crowd''s shouting annoys him.","D":"He describes the crowd as being united, even though the crowd clearly appears otherwise."}'::jsonb, NULL, 'D', NULL, NULL, 22)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 11, '2-11', 11, 'mcq', 'Top Four Species of Wild Land Mammals by Global Biomass [Bar graph. Vertical axis: Global biomass (millions of tonnes), from 0 to 3.0. Horizontal axis lists four species: African bush elephant, eastern gray kangaroo, wild boar, white-tailed deer.]

Global biomass is the total mass of living material, such as animals and plants, on Earth. A team of scientists estimated the global biomass, by species, of various wild land mammals. The team found that the species with the highest global biomass is the ______

(Figure: Bar graph titled "Top Four Species of Wild Land Mammals by Global Biomass." Vertical axis: Global biomass (millions of tonnes), scaled 0 to 3.0. Horizontal axis lists four species: African bush elephant, eastern gray kangaroo, wild boar, and white-tailed deer.)', 'Bar graph titled "Top Four Species of Wild Land Mammals by Global Biomass." Vertical axis: Global biomass (millions of tonnes), scaled 0 to 3.0. Horizontal axis lists four species: African bush elephant, eastern gray kangaroo, wild boar, and white-tailed deer.', 'Which choice most effectively uses data from the graph to complete the sentence?', '{"A":"wild boar.","B":"eastern gray kangaroo.","C":"African bush elephant.","D":"white-tailed deer."}'::jsonb, NULL, 'D', NULL, NULL, 22)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 12, '2-12', 12, 'mcq', 'Number and Origin of Clamshell Tools Found at Different Levels Below the Surface in Neanderthal Cave [Table with columns: Depth of tools found below surface in cave (meters); Clamshells that Neanderthals collected from the beach; Clamshells that Neanderthals harvested from the seafloor. Rows: 3–4: 99, 33; 6–7: 1, 0; 4–5: 2, 0; 2–3: 7, 0; 5–6: 18, 7.]

Studying tools unearthed at a cave site on the western coast of Italy, archaeologist Paola Villa and colleagues have determined that prehistoric Neanderthal groups fashioned them from shells of clams that they harvested from the seafloor while wading or diving or that washed up on the beach. Clamshells become thin and eroded as they wash up on the beach, while those on the seafloor are smooth and sturdy, so the research team suspects that Neanderthals prized the tools made with seafloor shells. However, the team also concluded that those tools were likely more challenging to obtain, noting that ______', NULL, 'Which choice most effectively uses data from the table to support the research team''s conclusion?', '{"A":"at each depth below the surface in the cave, the difference in the numbers of tools of each type suggests that shells were easier to collect from the beach than to harvest from the seafloor.","B":"the highest number of tools were at a depth of 3–4 meters below the surface, which suggests that the Neanderthal population at the site was highest during the related period of time.","C":"at each depth below the surface in the cave, the difference in the numbers of tools of each type suggests that Neanderthals preferred to use clamshells from the beach because of their durability.","D":"the higher number of tools at depths of 5–6 meters below the surface in the cave than at depths of 4–5 meters below the surface suggests that the size of clam populations changed over time."}'::jsonb, NULL, 'A', NULL, NULL, 23)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 13, '2-13', 13, 'mcq', 'Power Conversion Efficiency of Lowest and Highest Performing Spin-coated and Spray-coated Electron Transport Layers [Bar graph. Vertical axis: Power conversion efficiency (%), from 0 to 18. Horizontal axis: Thickness, grouped as lowest performing and highest performing. Legend: spray coating, spin coating.]

Perovskite solar cells convert light into electricity more efficiently than earlier kinds of solar cells, and manufacturing advances have recently made them commercially attractive. One limitation of the cells, however, has to do with their electron transport layer (ETL), through which absorbed electrons must pass. Often the ETL is applied through a process called spin coating, but such ETLs are fairly inefficient at converting input power to output power. André Taylor and colleagues tested a novel spray coating method for applying the ETL. The team produced ETLs of various thicknesses and concluded that spray coating holds promise for improving the power conversion efficiency of ETLs in perovskite solar cells.

(Figure: Bar graph titled "Power Conversion Efficiency of Lowest and Highest Performing Spin-coated and Spray-coated Electron Transport Layers." Vertical axis: Power conversion efficiency (%), scaled 0 to 18. Horizontal axis: Thickness, with lowest performing and highest performing groupings. Legend: spray coating and spin coating.)', 'Bar graph titled "Power Conversion Efficiency of Lowest and Highest Performing Spin-coated and Spray-coated Electron Transport Layers." Vertical axis: Power conversion efficiency (%), scaled 0 to 18. Horizontal axis: Thickness, with lowest performing and highest performing groupings. Legend: spray coating and spin coating.', 'Which choice best describes data from the graph that support Taylor and colleagues'' conclusion?', '{"A":"Both the ETL applied through spin coating and the ETL applied through spray coating showed a power conversion efficiency greater than 10% at their lowest performing thickness.","B":"The lowest performing ETL applied through spray coating had a higher power conversion efficiency than the highest performing ETL applied through spin coating.","C":"The highest performing ETL applied through spray coating showed a power conversion efficiency of approximately 13%, while the highest performing ETL applied through spin coating showed a power conversion efficiency of approximately 11%.","D":"There was a substantial difference in power conversion efficiency between the lowest and highest performing ETLs applied through spray coating."}'::jsonb, NULL, 'B', NULL, NULL, 24)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 14, '2-14', 14, 'mcq', 'Employment by Sector in France and the United States, 1800–2012 (% of total employment) [Table. Columns: Year; Agriculture in France; Manufacturing in France; Services in France; Agriculture in US; Manufacturing in US; Services in US. Rows: 1800: 64, 22, 14, 68, 18, 13; 1900: 43, 29, 28, 41, 28, 31; 1950: 32, 33, 35, 14, 33, 53; 2012: 3, 21, 76, 2, 18, 80. Rows in table may not add up to 100 due to rounding.]

Over the past two hundred years, the percentage of the population employed in the agricultural sector has declined in both France and the United States, while employment in the service sector (which includes jobs in retail, consulting, real estate, etc.) has risen. However, this transition happened at very different rates in the two countries. This can be seen most clearly by comparing the employment by sector in both countries in ______', NULL, 'Which choice most effectively uses data from the table to complete the statement?', '{"A":"1900 with the employment by sector in 1950.","B":"1800 with the employment by sector in 2012.","C":"1900 with the employment by sector in 2012.","D":"1800 with the employment by sector in 1900."}'::jsonb, NULL, 'A', NULL, NULL, 25)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 15, '2-15', 15, 'mcq', 'The linguistic niche hypothesis (LNH) posits that the exotericity of languages (how prevalent non-native speakers are) and grammatical complexity are inversely related, which the LNH ascribes to attrition of complex grammatical rules as more non-native speakers adopt the language but fail to acquire those rules. Focusing on two characteristics that are positive indices of grammatical complexity, fusion (when new phonemes arise from the merger of previously distinct ones) and informativity (languages'' capacity for meaningful variation), Olena Shcherbakova and colleagues conducted a quantitative analysis for more than 1,300 languages and claim the outcome is inconsistent with the LNH.', NULL, 'Which finding, if true, would most directly support Shcherbakova and colleagues'' claim?', '{"A":"Shcherbakova and colleagues'' analysis showed a slightly negative correlation between grammatical complexity and fusion and between grammatical complexity and informativity.","B":"Shcherbakova and colleagues'' analysis showed a slightly negative correlation between grammatical complexity and exotericity.","C":"Shcherbakova and colleagues'' analysis showed a slightly positive correlation between grammatical complexity and fusion.","D":"Shcherbakova and colleagues'' analysis showed a slightly positive correlation between fusion and exotericity and between informativity and exotericity."}'::jsonb, NULL, 'D', NULL, NULL, 26)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 16, '2-16', 16, 'mcq', 'Archaeologist Christiana Kohler and her team excavated the Egyptian tomb of Queen Merneith, the wife of a First Dynasty pharaoh. Some scholars claim that she also ruled Egypt on her own and was actually the first female pharaoh. The team found a tablet in Merneith''s tomb with writing suggesting that she was in charge of the country''s treasury and other central offices. Whether Merneith was a pharaoh or not, this discovery supports the idea that Merneith likely ______', NULL, 'Which choice most logically completes the text?', '{"A":"had an important role in Egypt''s government.","B":"lived after rather than before the First Dynasty of Egypt.","C":"traveled beyond Egypt''s borders often.","D":"created a new form of writing in Egypt."}'::jsonb, NULL, 'A', NULL, NULL, 26)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 17, '2-17', 17, 'mcq', 'In a study of the cognitive abilities of white-faced capuchin monkeys (Cebus imitator), researchers neglected to control for the physical difficulty of the tasks they used to evaluate the monkeys. The cognitive abilities of monkeys given problems requiring little dexterity, such as sliding a panel to retrieve food, were judged by the same criteria as were those of monkeys given physically demanding problems, such as unscrewing a bottle and inserting a straw. The results of the study, therefore, ______', NULL, 'Which choice most logically completes the text?', '{"A":"could suggest that there are differences in cognitive ability among the monkeys even though such differences may not actually exist.","B":"are useful for identifying tasks that the monkeys lack the cognitive capacity to perform but not for identifying tasks that the monkeys can perform.","C":"should not be taken as indicative of the cognitive abilities of any monkey species other than C. imitator.","D":"reveal more about the monkeys'' cognitive abilities when solving artificial problems than when solving problems encountered in the wild."}'::jsonb, NULL, 'A', NULL, NULL, 26)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 18, '2-18', 18, 'mcq', 'Public-awareness campaigns about the need to reduce single-use plastics can be successful, says researcher Kim Borg of Monash University in Australia, when these campaigns give consumers a choice: for example, Japan achieved a 40 percent reduction in plastic-bag use after cashiers were instructed to ask customers whether ______ wanted a bag.', NULL, 'Which choice completes the text so that it conforms to the conventions of Standard English?', '{"A":"they","B":"one","C":"you","D":"it"}'::jsonb, NULL, 'A', NULL, NULL, 27)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 19, '2-19', 19, 'mcq', 'Lucía Michel of the University of Chile observed that alkaline soils contain an insoluble form of iron that blueberry plants cannot absorb, thus inhibiting blueberry growth. If these plants were grown in alkaline soil alongside grasses that aid in iron solubilization, ______ Michel was determined to find out.', NULL, 'Which choice completes the text so that it conforms to the conventions of Standard English?', '{"A":"could the blueberries thrive.","B":"the blueberries could thrive.","C":"the blueberries could thrive?","D":"could the blueberries thrive?"}'::jsonb, NULL, 'D', NULL, NULL, 27)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 20, '2-20', 20, 'mcq', 'Atoms in a synchrotron, a type of circular particle accelerator, travel faster and faster until they ______ a desired energy level, at which point they are diverted to collide with a target, smashing the atoms.', NULL, 'Which choice completes the text so that it conforms to the conventions of Standard English?', '{"A":"will reach","B":"reach","C":"had reached","D":"are reaching"}'::jsonb, NULL, 'B', NULL, NULL, 27)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 21, '2-21', 21, 'mcq', 'In his 1963 exhibition Exposition of Music—Electronic Television, Korean American artist Nam June Paik showed how television images could be manipulated to express an artist''s perspective. Today, Paik ______ considered the first video artist.', NULL, 'Which choice completes the text so that it conforms to the conventions of Standard English?', '{"A":"will be","B":"had been","C":"was","D":"is"}'::jsonb, NULL, 'D', NULL, NULL, 27)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 22, '2-22', 22, 'mcq', 'Former First Lady of the United States Eleanor Roosevelt and Indian activist and educator Hansa Mehta were instrumental in drafting the United Nations'' Universal Declaration of Human Rights, a document that ______ the basic freedoms to which all people are entitled.', NULL, 'Which choice completes the text so that it conforms to the conventions of Standard English?', '{"A":"have outlined","B":"were outlining","C":"outlines","D":"outline"}'::jsonb, NULL, 'C', NULL, NULL, 27)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 23, '2-23', 23, 'mcq', 'In February 1919, following the end of the First World War, women from ten countries around the world convened the Inter-Allied Women''s Conference in Paris. The conference''s goals were ______ ensure women''s participation in the proceedings of the Paris Peace Conference, to secure the right of women to serve in the League of Nations, and to advocate for human rights.', NULL, 'Which choice completes the text so that it conforms to the conventions of Standard English?', '{"A":"threefold: to","B":"threefold. To","C":"threefold to","D":"threefold; to"}'::jsonb, NULL, 'A', NULL, NULL, 28)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 24, '2-24', 24, 'mcq', 'Mathematician Grigori Perelman, sometimes in conjunction with mathematicians Richard S. Hamilton and Shing-Tung Yau, ______ credited with proving the Poincaré conjecture. Having built on Hamilton''s previous work to solve the proof, Perelman has insisted that Hamilton receive credit. Yau later found and closed gaps in Perelman''s proof, persuading some mathematicians that he deserves credit as well.', NULL, 'Which choice completes the text so that it conforms to the conventions of Standard English?', '{"A":"are","B":"have been","C":"are being","D":"is"}'::jsonb, NULL, 'D', NULL, NULL, 28)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 25, '2-25', 25, 'mcq', 'Researchers studying magnetosensation have determined why some soil-dwelling roundworms in the Southern Hemisphere move in the opposite direction of Earth''s magnetic field when searching for ______ in the Northern Hemisphere, the magnetic field points down, into the ground, but in the Southern Hemisphere, it points up, toward the surface and away from worms'' food sources.', NULL, 'Which choice completes the text so that it conforms to the conventions of Standard English?', '{"A":"food:","B":"food,","C":"food while","D":"food"}'::jsonb, NULL, 'A', NULL, NULL, 28)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 26, '2-26', 26, 'mcq', 'Most conifers (trees belonging to the phylum Coniferophyta) are evergreen. That is, they keep their green leaves or needles year-round. However, not all conifer species are evergreen. Larch trees, ______ lose their needles every fall.', NULL, 'Which choice completes the text with the most logical transition?', '{"A":"for instance,","B":"nevertheless,","C":"meanwhile,","D":"in addition,"}'::jsonb, NULL, 'A', NULL, NULL, 28)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 27, '2-27', 27, 'mcq', 'Neuroscientist Karen Konkoly wanted to determine whether individuals can understand and respond to questions during REM sleep. She first taught volunteers eye movements they would use to respond to basic math problems while asleep (a single left-right eye movement indicated the number one). ______ she attached electrodes to the volunteers'' faces to record their eye movements during sleep.', NULL, 'Which choice completes the text with the most logical transition?', '{"A":"Specifically,","B":"Next,","C":"For instance,","D":"In sum,"}'::jsonb, NULL, 'B', NULL, NULL, 29)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 28, '2-28', 28, 'mcq', 'In his 1925 book The Morphology of Landscape, US geographer Carl Sauer challenged prevailing views about how natural landscapes influence human cultures. ______ Sauer argued that instead of being shaped entirely by their natural surroundings, cultures play an active role in their own development by virtue of their interactions with the environment.', NULL, 'Which choice completes the text with the most logical transition?', '{"A":"Similarly,","B":"Finally,","C":"Therefore,","D":"Specifically,"}'::jsonb, NULL, 'D', NULL, NULL, 29)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 29, '2-29', 29, 'mcq', 'In her 2012 analysis of tree rings from Japan''s Yaku Island, cosmic ray physicist Fusa Miyake noted an anomalous carbon-14 spike dating to 774–775 CE, indicating that a massive burst of radiation reached Earth during that time. ______ this unprecedented radiocarbon surge was dubbed a "Miyake event" in honor of its discoverer.', NULL, 'Which choice completes the text with the most logical transition?', '{"A":"Fittingly,","B":"Similarly,","C":"However,","D":"In other words,"}'::jsonb, NULL, 'A', NULL, NULL, 29)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 30, '2-30', 30, 'mcq', 'Researchers Helena Mihaljević-Brandt, Lucía Santamaría, and Marco Tullney report that while mathematicians may have traditionally worked alone, evidence points to a shift in the opposite direction. ______ mathematicians are choosing to collaborate with their peers—a trend illustrated by a rise in the number of mathematics publications credited to multiple authors.', NULL, 'Which choice completes the text with the most logical transition?', '{"A":"Similarly,","B":"For this reason,","C":"Furthermore,","D":"Increasingly,"}'::jsonb, NULL, 'D', NULL, NULL, 30)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 31, '2-31', 31, 'mcq', 'While researching a topic, a student has taken the following notes:
• Shaun Tan is an Australian author.
• In 2008, he published Tales from Outer Suburbia, a book of fifteen short stories.
• The stories describe surreal events occurring in otherwise ordinary suburban neighborhoods.
• In 2018, he published Tales from the Inner City, a book of twenty-five short stories.
• The stories describe surreal events occurring in otherwise ordinary urban settings.
The student wants to emphasize a similarity between the two books by Shaun Tan.', NULL, 'Which choice most effectively uses relevant information from the notes to accomplish this goal?', '{"A":"Shaun Tan''s book Tales from Outer Suburbia, which describes surreal events occurring in otherwise ordinary places, contains fewer short stories than Tales from the Inner City does.","B":"Tales from Outer Suburbia was published in 2008, and Tales from the Inner City was published in 2018.","C":"Unlike Tales from the Inner City, Shaun Tan''s book Tales from Outer Suburbia is set in suburban neighborhoods.","D":"Shaun Tan''s books Tales from Outer Suburbia and Tales from the Inner City both describe surreal events occurring in otherwise ordinary places."}'::jsonb, NULL, 'D', NULL, NULL, 30)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 32, '2-32', 32, 'mcq', 'While researching a topic, a student has taken the following notes:
• Started in 1925, the Scripps National Spelling Bee is a US-based spelling competition.
• The words used in the competition have diverse linguistic origins.
• In 2008, Sameer Mishra won by correctly spelling the word "guerdon."
• "Guerdon" derives from the Anglo-French word "guerdun."
• In 2009, Kavya Shivashankar won by correctly spelling the word "Laodicean."
• "Laodicean" derives from the ancient Greek word "Laodíkeia."
The student wants to emphasize a difference in the origins of the two words.', NULL, 'Which choice most effectively uses relevant information from the notes to accomplish this goal?', '{"A":"\"Guerdon,\" the final word of the 2008 Scripps National Spelling Bee, is of Anglo-French origin, while the following year''s final word, \"Laodicean,\" derives from ancient Greek.","B":"In 2008, Sameer Mishra won the Scripps National Spelling Bee by correctly spelling the word \"guerdon\"; however, the following year, Kavya Shivashankar won based on spelling the word \"Laodicean.\"","C":"Kavya Shivashankar won the 2009 Scripps National Spelling Bee by correctly spelling \"Laodicean,\" which derives from the ancient Greek word \"Laodíkeia.\"","D":"The Scripps National Spelling Bee uses words from diverse linguistic origins, such as \"guerdon\" and \"Laodicean.\""}'::jsonb, NULL, 'A', NULL, NULL, 31)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 33, '2-33', 33, 'mcq', 'While researching a topic, a student has taken the following notes:
• In 1851, German American artist Emanuel Leutze painted Washington Crossing the Delaware.
• His huge painting (149 × 255 inches) depicts the first US president crossing a river with soldiers in the Revolutionary War.
• In 2019, Cree artist Kent Monkman painted mistikôsiwak (Wooden Boat People): Resurgence of the People.
• Monkman''s huge painting (132 × 264 inches) was inspired by Leutze''s.
• It portrays Indigenous people in a boat rescuing refugees.
The student wants to emphasize a similarity between the two paintings.', NULL, 'Which choice most effectively uses relevant information from the notes to accomplish this goal?', '{"A":"Monkman, a Cree artist, finished his painting in 2019; Leutze, a German American artist, completed his in 1851.","B":"Although Monkman''s painting was inspired by Leutze''s, the people and actions the two paintings portray are very different.","C":"Leutze''s and Monkman''s paintings are both huge, measuring 149 × 255 inches and 132 × 264 inches, respectively.","D":"Leutze''s painting depicts Revolutionary War soldiers, while Monkman''s depicts Indigenous people and refugees."}'::jsonb, NULL, 'C', NULL, NULL, 31)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;

  INSERT INTO public.test_modules (test_id, position, section, label, time_limit_seconds, question_count)
  VALUES (v_test, 3, 'math', 'Math — Module 1', 2100, 27)
  ON CONFLICT (test_id, position) DO UPDATE SET section=EXCLUDED.section, label=EXCLUDED.label,
    time_limit_seconds=EXCLUDED.time_limit_seconds, question_count=EXCLUDED.question_count
  RETURNING id INTO v_mod;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 1, '3-1', 1, 'mcq', 'The line graph shows the percent of cars for sale at a used car lot on a given day by model year.

(Figure: Line graph titled with x-axis "Model year" (labeled 2010 through 2019) and y-axis "Percent of cars for sale" (0% to 15%). The plotted points: 2010 ≈ 12%, 2011 ≈ 12%, 2012 ≈ 12%, 2013 ≈ 8%, 2014 ≈ 4%, 2015 ≈ 9%, 2016 ≈ 10%, 2017 ≈ 10%, 2018 ≈ 11%, 2019 ≈ 11%. The lowest point is at 2014.)', 'Line graph titled with x-axis "Model year" (labeled 2010 through 2019) and y-axis "Percent of cars for sale" (0% to 15%). The plotted points: 2010 ≈ 12%, 2011 ≈ 12%, 2012 ≈ 12%, 2013 ≈ 8%, 2014 ≈ 4%, 2015 ≈ 9%, 2016 ≈ 10%, 2017 ≈ 10%, 2018 ≈ 11%, 2019 ≈ 11%. The lowest point is at 2014.', 'For what model year is the percent of cars for sale the smallest?', '{"A":"2012","B":"2013","C":"2014","D":"2015"}'::jsonb, NULL, 'C', NULL, NULL, 32)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 2, '3-2', 2, 'mcq', '(Figure: An xy-coordinate plane with x-axis from -6 to 6 and y-axis from -6 to 6. Two straight lines are drawn. The lines intersect at the point (4, -5) in the fourth quadrant.)', 'An xy-coordinate plane with x-axis from -6 to 6 and y-axis from -6 to 6. Two straight lines are drawn. The lines intersect at the point (4, -5) in the fourth quadrant.', 'The graph of a system of linear equations is shown. What is the solution $(x, y)$ to the system?', '{"A":"$(4, -5)$","B":"$(0, 3)$","C":"$(0, -2)$","D":"$(-2, 3)$"}'::jsonb, NULL, 'A', NULL, NULL, 32)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 3, '3-3', 3, 'mcq', NULL, NULL, 'The total cost, in dollars, to rent a surfboard consists of a $25 service fee and a $10 per hour rental fee. A person rents a surfboard for $t$ hours and intends to spend a maximum of $75 to rent the surfboard. Which inequality represents this situation?', '{"A":"$10t \\le 75$","B":"$10 + 25t \\le 75$","C":"$25t \\le 75$","D":"$25 + 10t \\le 75$"}'::jsonb, NULL, 'D', NULL, NULL, 33)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 4, '3-4', 4, 'mcq', '(Figure: The given graph is an upward-opening parabola in an xy-plane (x-axis from -6 to 10, y-axis from -8 to 4) with vertex at approximately (2, -2), passing through the y-axis near y = 4. The four answer choices A-D are each graphs of upward-opening parabolas on identical grids; the correct one is the original parabola shifted up 4 units (vertex near (2, 2)).)', 'The given graph is an upward-opening parabola in an xy-plane (x-axis from -6 to 10, y-axis from -8 to 4) with vertex at approximately (2, -2), passing through the y-axis near y = 4. The four answer choices A-D are each graphs of upward-opening parabolas on identical grids; the correct one is the original parabola shifted up 4 units (vertex near (2, 2)).', 'The graph shown will be translated up 4 units. Which of the following will be the resulting graph?', '{"A":"A parabola opening upward with vertex at approximately (2, 2), passing through the y-axis near y = 5.","B":"A parabola opening upward with vertex at approximately (2, -6).","C":"A parabola opening upward with vertex at approximately (-2, -1).","D":"A parabola opening upward with vertex at approximately (6, -2)."}'::jsonb, NULL, 'A', NULL, NULL, 34)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 5, '3-5', 5, 'mcq', NULL, NULL, '$s = 40 + 3t$

The equation gives the speed $s$, in miles per hour, of a certain car $t$ seconds after it began to accelerate. What is the speed, in miles per hour, of the car 5 seconds after it began to accelerate?', '{"A":"40","B":"43","C":"45","D":"55"}'::jsonb, NULL, 'D', NULL, NULL, 36)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 6, '3-6', 6, 'grid', NULL, NULL, 'The function $f$ is defined by $f(x) = x^2 + x + 71$. What is the value of $f(2)$ ?', NULL, NULL, '77', '["77"]'::jsonb, NULL, 36)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 7, '3-7', 7, 'grid', NULL, NULL, 'An event planner is planning a party. It costs the event planner a one-time fee of $35 to rent the venue and $10.25 per attendee. The event planner has a budget of $300. What is the greatest number of attendees possible without exceeding the budget?', NULL, NULL, '25', '["25"]'::jsonb, NULL, 36)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 8, '3-8', 8, 'mcq', 'The table gives the distribution of votes for a new school mascot and grade level for 80 students. The table has columns: Mascot, Sixth, Seventh, Eighth, Total. Rows: Badger 4, 9, 9, 22; Lion 9, 2, 9, 20; Longhorn 4, 6, 4, 14; Tiger 6, 9, 9, 24; Total 23, 26, 31, 80.', NULL, 'If one of these students is selected at random, what is the probability of selecting a student whose vote for new mascot was for a lion?', '{"A":"$\\frac{1}{9}$","B":"$\\frac{1}{5}$","C":"$\\frac{1}{4}$","D":"$\\frac{2}{3}$"}'::jsonb, NULL, 'C', NULL, NULL, 36)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 9, '3-9', 9, 'mcq', NULL, NULL, 'Triangles $ABC$ and $DEF$ are congruent, where $A$ corresponds to $D$, and $B$ and $E$ are right angles. The measure of angle $A$ is $18^\circ$. What is the measure of angle $F$ ?', '{"A":"$18^\\circ$","B":"$72^\\circ$","C":"$90^\\circ$","D":"$162^\\circ$"}'::jsonb, NULL, 'B', NULL, NULL, 36)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 10, '3-10', 10, 'mcq', NULL, NULL, 'If $4x + 2 = 12$, what is the value of $16x + 8$ ?', '{"A":"40","B":"48","C":"56","D":"60"}'::jsonb, NULL, 'B', NULL, NULL, 37)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 11, '3-11', 11, 'mcq', NULL, NULL, 'Which expression is equivalent to $(m^4 q^4 z^{-1})(mq^5 z^3)$, where $m$, $q$, and $z$ are positive?', '{"A":"$m^4 q^{20} z^{-3}$","B":"$m^5 q^9 z^2$","C":"$m^6 q^8 z^{-1}$","D":"$m^{20} q^{12} z^{-2}$"}'::jsonb, NULL, 'B', NULL, NULL, 37)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 12, '3-12', 12, 'mcq', NULL, NULL, 'An airplane descends from an altitude of 9,500 feet to 5,000 feet at a constant rate of 400 feet per minute. What type of function best models the relationship between the descending airplane''s altitude and time?', '{"A":"Decreasing exponential","B":"Decreasing linear","C":"Increasing exponential","D":"Increasing linear"}'::jsonb, NULL, 'B', NULL, NULL, 37)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 13, '3-13', 13, 'grid', NULL, NULL, '$3x + 6y = 4$
$3x + 4y = 2$

The solution to the given system of equations is $(x, y)$. What is the value of $y$ ?', NULL, NULL, '1', '["1"]'::jsonb, NULL, 37)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 14, '3-14', 14, 'grid', NULL, NULL, 'The function $f$ is defined by $f(x) = (x - 6)(x - 2)(x + 6)$. In the $xy$-plane, the graph of $y = g(x)$ is the result of translating the graph of $y = f(x)$ up 4 units. What is the value of $g(0)$ ?', NULL, NULL, '76', '["76"]'::jsonb, NULL, 37)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 15, '3-15', 15, 'mcq', NULL, NULL, 'The function $f(w) = 6w^2$ gives the area of a rectangle, in square feet ($\text{ft}^2$), if its width is $w$ ft and its length is 6 times its width. Which of the following is the best interpretation of $f(14) = 1{,}176$ ?', '{"A":"If the width of the rectangle is 14 ft, then the area of the rectangle is 1,176 ft$^2$.","B":"If the width of the rectangle is 14 ft, then the length of the rectangle is 1,176 ft.","C":"If the width of the rectangle is 1,176 ft, then the length of the rectangle is 14 ft.","D":"If the width of the rectangle is 1,176 ft, then the area of the rectangle is 14 ft$^2$."}'::jsonb, NULL, 'A', NULL, NULL, 37)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 16, '3-16', 16, 'mcq', NULL, NULL, 'The number of bacteria in a liquid medium doubles every day. There are 44,000 bacteria in the liquid medium at the start of an observation. Which of the following represents the number of bacteria, $y$, in the liquid medium $t$ days after the start of the observation?', '{"A":"$y = \\frac{1}{2}(44{,}000)^t$","B":"$y = 2(44{,}000)^t$","C":"$y = 44{,}000\\left(\\frac{1}{2}\\right)^t$","D":"$y = 44{,}000(2)^t$"}'::jsonb, NULL, 'D', NULL, NULL, 38)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 17, '3-17', 17, 'mcq', 'The table shows the exponential relationship between the number of years, x, since Hana started training in pole vault, and the estimated height h(x), in meters, of her best pole vault for that year. The table has columns x and h(x) with rows: x = 0, h(x) = 1.23; x = 2, h(x) = 1.54; x = 4, h(x) = 1.94.', NULL, 'Which of the following functions best represents this relationship, where $x \le 4$ ?', '{"A":"$h(x) = 1.12(0.23)^x$","B":"$h(x) = 1.12(1.23)^x$","C":"$h(x) = 1.23(0.12)^x$","D":"$h(x) = 1.23(1.12)^x$"}'::jsonb, NULL, 'D', NULL, NULL, 38)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 18, '3-18', 18, 'mcq', NULL, NULL, 'The function $h$ is defined by $h(x) = 4x + 28$. The graph of $y = h(x)$ in the $xy$-plane has an $x$-intercept at $(a, 0)$ and a $y$-intercept at $(0, b)$, where $a$ and $b$ are constants. What is the value of $a + b$ ?', '{"A":"21","B":"28","C":"32","D":"35"}'::jsonb, NULL, 'A', NULL, NULL, 38)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 19, '3-19', 19, 'mcq', NULL, NULL, '$y < 5x + 6$

For which of the following tables are all the values of $x$ and their corresponding values of $y$ solutions to the given inequality?', '{"A":"Table with columns x, y and rows: (3, 17), (5, 27), (7, 37).","B":"Table with columns x, y and rows: (3, 17), (5, 35), (7, 37).","C":"Table with columns x, y and rows: (3, 25), (5, 35), (7, 45).","D":"Table with columns x, y and rows: (3, 21), (5, 31), (7, 41)."}'::jsonb, NULL, 'A', NULL, NULL, 38)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 20, '3-20', 20, 'grid', NULL, NULL, '$y = 4x + 1$
$4y = 15x - 8$

The solution to the given system of equations is $(x, y)$. What is the value of $x - y$ ?', NULL, NULL, '35', '["35"]'::jsonb, NULL, 39)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 21, '3-21', 21, 'grid', NULL, NULL, 'A right triangle has legs with lengths of 24 centimeters and 21 centimeters. If the length of this triangle''s hypotenuse, in centimeters, can be written in the form $d\sqrt{3}$, where $d$ is an integer, what is the value of $d$ ?', NULL, NULL, '113', '["113"]'::jsonb, NULL, 39)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 22, '3-22', 22, 'mcq', NULL, NULL, 'The floor of a ballroom has an area of 600 square meters. An architect creates a scale model of the floor of the ballroom, where the length of each side of the model is $\frac{1}{10}$ times the length of the corresponding side of the actual floor of the ballroom. What is the area, in square meters, of the scale model?', '{"A":"6","B":"10","C":"60","D":"150"}'::jsonb, NULL, 'A', NULL, NULL, 39)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 23, '3-23', 23, 'mcq', NULL, NULL, 'Which of the following equations represents a circle in the $xy$-plane that intersects the $y$-axis at exactly one point?', '{"A":"$(x - 8)^2 + (y - 8)^2 = 16$","B":"$(x - 8)^2 + (y - 4)^2 = 16$","C":"$(x - 4)^2 + (y - 9)^2 = 16$","D":"$x^2 + (y - 9)^2 = 16$"}'::jsonb, NULL, 'C', NULL, NULL, 39)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 24, '3-24', 24, 'mcq', NULL, NULL, 'In triangles $ABC$ and $DEF$, angles $B$ and $E$ each have measure $27^\circ$ and angles $C$ and $F$ each have measure $41^\circ$. Which additional piece of information is sufficient to determine whether triangle $ABC$ is congruent to triangle $DEF$ ?', '{"A":"The measure of angle $A$","B":"The length of side $AB$","C":"The lengths of sides $BC$ and $EF$","D":"No additional information is necessary."}'::jsonb, NULL, 'C', NULL, NULL, 39)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 25, '3-25', 25, 'mcq', NULL, NULL, 'The result of increasing the quantity $x$ by $1{,}800\%$ is 684. What is the value of $x$ ?', '{"A":"12,996","B":"12,312","C":"38","D":"36"}'::jsonb, NULL, 'D', NULL, NULL, 39)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 26, '3-26', 26, 'mcq', NULL, NULL, 'A window repair specialist charges $220 for the first two hours of repair plus an hourly fee for each additional hour. The total cost for 5 hours of repair is $400. Which function $f$ gives the total cost, in dollars, for $x$ hours of repair, where $x \ge 2$ ?', '{"A":"$f(x) = 60x + 100$","B":"$f(x) = 60x + 220$","C":"$f(x) = 80x$","D":"$f(x) = 80x + 220$"}'::jsonb, NULL, 'A', NULL, NULL, 40)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 27, '3-27', 27, 'grid', NULL, NULL, '$x(x + 1) - 56 = 4(x - 7)$

What is the sum of the solutions to the given equation?', NULL, NULL, '29/3', '["29/3","9.666","9.667"]'::jsonb, NULL, 40)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;

  INSERT INTO public.test_modules (test_id, position, section, label, time_limit_seconds, question_count)
  VALUES (v_test, 4, 'math', 'Math — Module 2', 2100, 27)
  ON CONFLICT (test_id, position) DO UPDATE SET section=EXCLUDED.section, label=EXCLUDED.label,
    time_limit_seconds=EXCLUDED.time_limit_seconds, question_count=EXCLUDED.question_count
  RETURNING id INTO v_mod;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 1, '4-1', 1, 'mcq', NULL, NULL, 'An object''s speed is 64 yards per second. What is the object''s speed, in feet per second? (1 yard = 3 feet)', '{"A":"61","B":"67","C":"94","D":"192"}'::jsonb, NULL, 'D', NULL, NULL, 46)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 2, '4-2', 2, 'mcq', 'The scatterplot shows the relationship between two variables, $x$ and $y$. A line of best fit is also shown.

(Figure: A scatterplot in the xy-plane. The x-axis is labeled x and runs from 0 to about 14 (gridlines at 2, 4, 6, 8, 10, 12, 14); the y-axis is labeled y and runs from 0 to 20 (gridlines at 2, 4, 6, ..., 20). Five data points rise from lower left to upper right at approximately (4, 6), (6, 10), (8, 11), (10, 13.5), and (12, 15), with a sixth near (13, 16). A straight line of best fit is drawn through them, crossing the y-axis near 3.4 and increasing with a slope of about 1.)', 'A scatterplot in the xy-plane. The x-axis is labeled x and runs from 0 to about 14 (gridlines at 2, 4, 6, 8, 10, 12, 14); the y-axis is labeled y and runs from 0 to 20 (gridlines at 2, 4, 6, ..., 20). Five data points rise from lower left to upper right at approximately (4, 6), (6, 10), (8, 11), (10, 13.5), and (12, 15), with a sixth near (13, 16). A straight line of best fit is drawn through them, crossing the y-axis near 3.4 and increasing with a slope of about 1.', 'Which of the following equations best represents the line of best fit shown?', '{"A":"$y = x + 3.4$","B":"$y = x - 3.4$","C":"$y = -x + 3.4$","D":"$y = -x - 3.4$"}'::jsonb, NULL, 'A', NULL, NULL, 46)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 3, '4-3', 3, 'mcq', 'The graph shows the linear relationship between $x$ and $y$.

(Figure: A line graph in the xy-plane. The x-axis runs from -8 to 8 and the y-axis from -6 to 10. A straight line slopes upward from lower left to upper right, passing through approximately (0, -5) on the y-axis and (2.5, 0) on the x-axis, with a slope of about 2.)', 'A line graph in the xy-plane. The x-axis runs from -8 to 8 and the y-axis from -6 to 10. A straight line slopes upward from lower left to upper right, passing through approximately (0, -5) on the y-axis and (2.5, 0) on the x-axis, with a slope of about 2.', 'Which table gives three values of $x$ and their corresponding values of $y$ for this relationship?', '{"A":"x: 0, 1, 2 with y: 0, -7, -9","B":"x: 0, 1, 2 with y: 0, -3, -1","C":"x: 0, 1, 2 with y: -5, -7, -9","D":"x: 0, 1, 2 with y: -5, -3, -1"}'::jsonb, NULL, 'D', NULL, NULL, 46)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 4, '4-4', 4, 'mcq', NULL, NULL, 'What is the perimeter, in inches, of a rectangle with a length of 4 inches and a width of 9 inches?', '{"A":"13","B":"17","C":"22","D":"26"}'::jsonb, NULL, 'D', NULL, NULL, 47)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 5, '4-5', 5, 'mcq', '$7m = 2(n + p)$', NULL, 'The given equation relates the positive numbers $m$, $n$, and $p$. Which equation correctly gives $m$ in terms of $n$ and $p$?', '{"A":"$m = \\dfrac{2(n + p)}{7}$","B":"$m = 2(n + p)$","C":"$m = 2(n + p) - 7$","D":"$m = 2 - n - p - 7$"}'::jsonb, NULL, 'A', NULL, NULL, 47)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 6, '4-6', 6, 'grid', '$73, 74, 75, 77, 79, 82, 84, 85, 91$', NULL, 'What is the median of the data shown?', NULL, NULL, '79', '["79"]'::jsonb, NULL, 47)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 7, '4-7', 7, 'grid', NULL, NULL, 'The function $f$ is defined by $f(x) = 4x$. For what value of $x$ does $f(x) = 8$?', NULL, NULL, '2', '["2"]'::jsonb, NULL, 47)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 8, '4-8', 8, 'mcq', NULL, NULL, 'Of 300,000 paper clips, 234,000 are size large. What percentage of the paper clips are size large?', '{"A":"22%","B":"33%","C":"66%","D":"78%"}'::jsonb, NULL, 'D', NULL, NULL, 47)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 9, '4-9', 9, 'mcq', '$f(x) = 8x + 4$', NULL, 'The function $f$ gives the estimated height, in feet, of a willow tree $x$ years after its height was first measured. Which statement is the best interpretation of 4 in this context?', '{"A":"The tree will be measured each year for 4 years.","B":"The tree is estimated to grow to a maximum height of 4 feet.","C":"The estimated height of the tree increased by 4 feet each year.","D":"The estimated height of the tree was 4 feet when it was first measured."}'::jsonb, NULL, 'D', NULL, NULL, 47)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 10, '4-10', 10, 'mcq', '$y = 76$
$y = x^2 - 5$', NULL, 'The graphs of the given equations in the xy-plane intersect at the point $(x, y)$. What is a possible value of $x$?', '{"A":"$-\\dfrac{76}{5}$","B":"$-9$","C":"$5$","D":"$76$"}'::jsonb, NULL, 'B', NULL, NULL, 48)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 11, '4-11', 11, 'mcq', NULL, NULL, 'Each side of equilateral triangle S is multiplied by a scale factor of $k$ to create equilateral triangle T. The length of each side of triangle T is greater than the length of each side of triangle S. Which of the following could be the value of $k$?', '{"A":"$\\dfrac{29}{28}$","B":"$1$","C":"$\\dfrac{28}{29}$","D":"$0$"}'::jsonb, NULL, 'A', NULL, NULL, 48)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 12, '4-12', 12, 'mcq', '$66x = 66x$', NULL, 'How many solutions does the given equation have?', '{"A":"Exactly one","B":"Exactly two","C":"Infinitely many","D":"Zero"}'::jsonb, NULL, 'C', NULL, NULL, 48)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 13, '4-13', 13, 'grid', NULL, NULL, 'Vivian bought party hats and cupcakes for $71. Each package of party hats cost $3, and each cupcake cost $1. If Vivian bought 10 packages of party hats, how many cupcakes did she buy?', NULL, NULL, '41', '["41"]'::jsonb, NULL, 48)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 14, '4-14', 14, 'grid', NULL, NULL, 'The exponential function $g$ is defined by $g(x) = 19 \cdot a^x$, where $a$ is a positive constant. If $g(3) = 2{,}375$, what is the value of $g(4)$?', NULL, NULL, '11875', '["11875"]'::jsonb, NULL, 48)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 15, '4-15', 15, 'mcq', NULL, NULL, 'In right triangle $RST$, the sum of the measures of angle $R$ and angle $S$ is 90 degrees. The value of $\sin(R)$ is $\dfrac{\sqrt{15}}{4}$. What is the value of $\cos(S)$?', '{"A":"$\\dfrac{\\sqrt{15}}{15}$","B":"$\\dfrac{\\sqrt{15}}{4}$","C":"$\\dfrac{4\\sqrt{15}}{15}$","D":"$\\sqrt{15}$"}'::jsonb, NULL, 'B', NULL, NULL, 49)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 16, '4-16', 16, 'mcq', 'The graph shows the relationship between the number of shares of stock from Company A, $x$, and the number of shares of stock from Company B, $y$, that Simone can purchase.

(Figure: A line graph in the first quadrant. The horizontal axis is labeled Company A (x) and runs from 0 to 100 (gridlines every 10); the vertical axis is labeled Company B (y) and runs from 0 to 50 (gridlines every 10). A straight line decreases from the y-intercept at (0, 40) down to the x-intercept at (60, 0).)', 'A line graph in the first quadrant. The horizontal axis is labeled Company A (x) and runs from 0 to 100 (gridlines every 10); the vertical axis is labeled Company B (y) and runs from 0 to 50 (gridlines every 10). A straight line decreases from the y-intercept at (0, 40) down to the x-intercept at (60, 0).', 'Which equation could represent this relationship?', '{"A":"$y = 8x + 12$","B":"$8x + 12y = 480$","C":"$y = 12x + 8$","D":"$12x + 8y = 480$"}'::jsonb, NULL, 'B', NULL, NULL, 49)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 17, '4-17', 17, 'mcq', NULL, NULL, 'Which expression is equivalent to $\dfrac{8x(x - 7) - 3(x - 7)}{2x - 14}$, where $x > 7$?', '{"A":"$\\dfrac{x - 7}{5}$","B":"$\\dfrac{8x - 3}{2}$","C":"$\\dfrac{8x^2 - 3x - 14}{2x - 14}$","D":"$\\dfrac{8x^2 - 3x - 77}{2x - 14}$"}'::jsonb, NULL, 'B', NULL, NULL, 50)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 18, '4-18', 18, 'mcq', NULL, NULL, 'The function $f$ is defined by $f(x) = (-8)(2)^x + 22$. What is the y-intercept of the graph of $y = f(x)$ in the xy-plane?', '{"A":"$(0, 14)$","B":"$(0, 2)$","C":"$(0, 22)$","D":"$(0, -8)$"}'::jsonb, NULL, 'A', NULL, NULL, 50)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 19, '4-19', 19, 'mcq', 'Keenan made 32 cups of vegetable broth. Keenan then filled $x$ small jars and $y$ large jars with all the vegetable broth he made. The equation $3x + 5y = 32$ represents this situation.', NULL, 'Which is the best interpretation of $5y$ in this context?', '{"A":"The number of large jars Keenan filled","B":"The number of small jars Keenan filled","C":"The total number of cups of vegetable broth in the large jars","D":"The total number of cups of vegetable broth in the small jars"}'::jsonb, NULL, 'C', NULL, NULL, 50)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 20, '4-20', 20, 'grid', NULL, NULL, 'A circle in the xy-plane has a diameter with endpoints $(2, 4)$ and $(2, 14)$. An equation of this circle is $(x - 2)^2 + (y - 9)^2 = r^2$, where $r$ is a positive constant. What is the value of $r$?', NULL, NULL, '5', '["5"]'::jsonb, NULL, 50)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 21, '4-21', 21, 'grid', NULL, NULL, 'Line $\ell$ is defined by $3y + 12x = 5$. Line $n$ is perpendicular to line $\ell$ in the xy-plane. What is the slope of line $n$?', NULL, NULL, '0.25', '["0.25","1/4"]'::jsonb, NULL, 50)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 22, '4-22', 22, 'mcq', '$|-5x + 13| = 73$', NULL, 'What is the sum of the solutions to the given equation?', '{"A":"$-\\dfrac{146}{5}$","B":"$-12$","C":"$0$","D":"$\\dfrac{26}{5}$"}'::jsonb, NULL, 'D', NULL, NULL, 51)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 23, '4-23', 23, 'mcq', NULL, NULL, 'For the exponential function $f$, the value of $f(1)$ is $k$, where $k$ is a constant. Which of the following equivalent forms of the function $f$ shows the value of $k$ as the coefficient or the base?', '{"A":"$f(x) = 50(1.6)^{x+1}$","B":"$f(x) = 80(1.6)^x$","C":"$f(x) = 128(1.6)^{x-1}$","D":"$f(x) = 204.8(1.6)^{x-2}$"}'::jsonb, NULL, 'C', NULL, NULL, 51)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 24, '4-24', 24, 'mcq', '$-9x^2 + 30x + c = 0$', NULL, 'In the given equation, $c$ is a constant. The equation has exactly one solution. What is the value of $c$?', '{"A":"$3$","B":"$0$","C":"$-25$","D":"$-53$"}'::jsonb, NULL, 'C', NULL, NULL, 51)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 25, '4-25', 25, 'mcq', NULL, NULL, 'Which of the following expressions has a factor of $x + 2b$, where $b$ is a positive integer constant?', '{"A":"$3x^2 + 7x + 14b$","B":"$3x^2 + 28x + 14b$","C":"$3x^2 + 42x + 14b$","D":"$3x^2 + 49x + 14b$"}'::jsonb, NULL, 'D', NULL, NULL, 51)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 26, '4-26', 26, 'mcq', 'Two data sets of 23 integers each are summarized in the histograms shown. For each of the histograms, the first interval represents the frequency of integers greater than or equal to 10, but less than 20. The second interval represents the frequency of integers greater than or equal to 20, but less than 30, and so on.

(Figure: Two histograms side by side, each with a vertical axis labeled Frequency (0 to 12) and a horizontal axis labeled Integer with bin boundaries at 10, 20, 30, 40, 50, 60. Data Set A: bars over the intervals starting at 10, 20, 30, 40 with frequencies of approximately 3, 4, 7, and 9 (rising left to right). Data Set B: bars over the same intervals with the same approximate frequencies of 3, 4, 7, and 9.)', 'Two histograms side by side, each with a vertical axis labeled Frequency (0 to 12) and a horizontal axis labeled Integer with bin boundaries at 10, 20, 30, 40, 50, 60. Data Set A: bars over the intervals starting at 10, 20, 30, 40 with frequencies of approximately 3, 4, 7, and 9 (rising left to right). Data Set B: bars over the same intervals with the same approximate frequencies of 3, 4, 7, and 9.', 'What is the smallest possible difference between the mean of data set A and the mean of data set B?', '{"A":"0","B":"1","C":"10","D":"23"}'::jsonb, NULL, 'B', NULL, NULL, 52)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 27, '4-27', 27, 'grid', NULL, NULL, 'The perimeter of an equilateral triangle is 624 centimeters. The height of this triangle is $k\sqrt{3}$ centimeters, where $k$ is a constant. What is the value of $k$?', NULL, NULL, '104', '["104"]'::jsonb, NULL, 52)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
END $seed$;

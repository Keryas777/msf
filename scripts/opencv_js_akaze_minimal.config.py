# Minimal OpenCV.js bindings for War Counter Vision.
# Keep the feature2d class definitions aligned with OpenCV 4.10.0's
# official platforms/js/opencv_js.config.py so AKAZE and BFMatcher
# are actually emitted by the bindings generator.

core = {
    'Algorithm': [],
}

imgproc = {
    '': ['cvtColor', 'resize'],
}

features2d = {
    'Feature2D': [
        'detect',
        'compute',
        'detectAndCompute',
        'descriptorSize',
        'descriptorType',
        'defaultNorm',
        'empty',
        'getDefaultName',
    ],
    'AKAZE': [
        'create',
        'setDescriptorType',
        'getDescriptorType',
        'setDescriptorSize',
        'getDescriptorSize',
        'setDescriptorChannels',
        'getDescriptorChannels',
        'setThreshold',
        'getThreshold',
        'setNOctaves',
        'getNOctaves',
        'setNOctaveLayers',
        'getNOctaveLayers',
        'setDiffusivity',
        'getDiffusivity',
        'getDefaultName',
    ],
    'DescriptorMatcher': [
        'add',
        'clear',
        'empty',
        'isMaskSupported',
        'train',
        'match',
        'knnMatch',
        'radiusMatch',
        'clone',
        'create',
    ],
    'BFMatcher': ['isMaskSupported', 'create'],
}

white_list = makeWhiteList([core, imgproc, features2d])

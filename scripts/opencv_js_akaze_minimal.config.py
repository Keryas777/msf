# Minimal OpenCV.js bindings for War Counter Vision.
# Keep only the APIs required by the mobile AKAZE benchmark.

core = {
    'Algorithm': [],
}

imgproc = {
    '': ['cvtColor', 'resize'],
}

features2d = {
    'Feature2D': ['detectAndCompute'],
    'AKAZE': ['create', 'setThreshold'],
    'DescriptorMatcher': ['knnMatch'],
    'BFMatcher': ['create'],
}

white_list = makeWhiteList([core, imgproc, features2d])
